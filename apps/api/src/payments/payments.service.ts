import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ActorType,
  PaymentProvider as PaymentProviderEnum,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import { randomUUID } from "node:crypto";
import { env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider as PaymentProviderImpl,
} from "./payment-provider.interface";

export interface CreateCheckoutInput {
  appointmentId: string;
  /** Optional gratuity in cents — added as a separate line item on the
   *  Stripe-hosted page and persisted as Payment.tipCents. */
  tipCents?: number;
  /** Optional override of the post-payment redirect; falls back to a route on
   *  WEB_ORIGIN that the frontend handles. Stripe requires both URLs. */
  successUrl?: string;
  cancelUrl?: string;
}

export interface RefundInput {
  /** Optional partial-refund amount in cents. Omit for a full refund. */
  amountCents?: number;
}

const APPOINTMENT_INCLUDE = {
  client: { select: { id: true, displayName: true, email: true } },
  staffMember: { select: { displayName: true } },
  services: {
    orderBy: [{ sortOrder: "asc" as const }],
    select: {
      serviceNameSnapshot: true,
      priceSnapshotCents: true,
      currencySnapshot: true,
    },
  },
  salon: { select: { name: true } },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProviderImpl,
  ) {}

  /**
   * Lookup payments by appointment id, scoped to the current salon. Used by
   * the schedule view to colour blocks and gate the "Pay now" button.
   *
   * Filtered to one row per appointment using the highest-priority status
   * (SUCCEEDED > FAILED > CANCELLED > PENDING) so the UI sees the most
   * important state — "succeeded" wins over a stale PENDING / FAILED on a
   * separate session for the same appointment.
   */
  async listForAppointments(salonId: string, appointmentIds: string[]) {
    if (appointmentIds.length === 0) return [];
    const rows = await this.prisma.payment.findMany({
      where: {
        salonId,
        appointmentId: { in: appointmentIds },
      },
      select: {
        id: true,
        appointmentId: true,
        status: true,
        amountCents: true,
        tipCents: true,
        refundedCents: true,
        currency: true,
        receiptUrl: true,
        capturedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const winner = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!r.appointmentId) continue;
      const existing = winner.get(r.appointmentId);
      if (!existing || rank(r.status) > rank(existing.status)) {
        winner.set(r.appointmentId, r);
      }
    }
    return Array.from(winner.values());
  }

  async createCheckoutForAppointment(
    salonId: string,
    actorUserId: string,
    input: CreateCheckoutInput,
  ): Promise<{ url: string; paymentId: string }> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: input.appointmentId, salonId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundException("Appointment not found");
    if (appointment.services.length === 0) {
      throw new BadRequestException(
        "Appointment has no services to charge for",
      );
    }

    // A SUCCEEDED payment already exists → caller is double-charging by
    // mistake. PENDING and FAILED rows are fine to re-attempt around (a
    // PENDING row may have come from an abandoned checkout window).
    const alreadyPaid = await this.prisma.payment.findFirst({
      where: {
        salonId,
        appointmentId: appointment.id,
        status: PaymentStatus.SUCCEEDED,
      },
      select: { id: true },
    });
    if (alreadyPaid) {
      throw new ConflictException({
        message: "This appointment is already paid",
        appointmentId: appointment.id,
        paymentId: alreadyPaid.id,
      });
    }

    const subtotalCents = appointment.services.reduce(
      (acc, s) => acc + s.priceSnapshotCents,
      0,
    );
    const tipCents = input.tipCents ?? 0;
    const currency = appointment.services[0]?.currencySnapshot ?? "USD";
    const productName = formatProductName(
      appointment.services.map((s) => s.serviceNameSnapshot),
      appointment.salon.name,
    );

    // Pre-generate the row id so we can pass it to the provider as the
    // idempotency key *before* we INSERT. A retry of the create-session
    // call (e.g. transient Stripe 5xx) hits Stripe's idempotency cache
    // and returns the original session — no duplicate sessions for one
    // booking attempt.
    const paymentId = randomUUID();
    const successUrl =
      input.successUrl ??
      `${env.WEB_ORIGIN}/schedule?paid=${appointment.id}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      input.cancelUrl ??
      `${env.WEB_ORIGIN}/schedule?paymentCancelled=${appointment.id}`;

    const session = await this.provider.createCheckoutSession({
      idempotencyKey: paymentId,
      amountCents: subtotalCents,
      tipCents,
      currency,
      successUrl,
      cancelUrl,
      productName,
      customerEmail: appointment.client?.email ?? undefined,
      metadata: {
        salonId,
        appointmentId: appointment.id,
        paymentId,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          id: paymentId,
          salonId,
          appointmentId: appointment.id,
          clientId: appointment.clientId,
          status: PaymentStatus.PENDING,
          provider: PaymentProviderEnum.STRIPE,
          providerPaymentId: session.providerSessionId,
          // amountCents is the subtotal (services-only). tipCents is the
          // breakdown; the total charged is amountCents + tipCents and is
          // computed at read time wherever the UI needs it.
          amountCents: subtotalCents,
          tipCents,
          currency,
          idempotencyKey: paymentId,
        },
      });
      await tx.domainEvent.create({
        data: {
          salonId,
          aggregateType: "PAYMENT",
          aggregateId: paymentId,
          eventType: EventType.PAYMENT_CREATED,
          payload: {
            appointmentId: appointment.id,
            amountCents: subtotalCents,
            tipCents,
            currency,
            providerSessionId: session.providerSessionId,
          } satisfies Prisma.InputJsonValue,
          actorType: actorUserId ? ActorType.USER : ActorType.SYSTEM,
          actorId: actorUserId ?? null,
        },
      });
      return { url: session.url, paymentId };
    });
  }

  /**
   * Issues a refund against a successful Payment. The webhook
   * (`charge.refunded`) is the source of truth for refund accounting,
   * but we update the row inline here too so the UI flips immediately
   * — the webhook's idempotent finalize won't re-process if the values
   * already match.
   *
   * 5c MVP supports only full refunds — passing `amountCents` smaller
   * than the captured total goes to Stripe but the inline update stays
   * conservative (status flips to PARTIALLY_REFUNDED). Partial-refund UI
   * lives in a follow-up issue.
   */
  async refund(
    salonId: string,
    actorUserId: string,
    paymentId: string,
    input: RefundInput,
  ): Promise<{ providerRefundId: string; refundedCents: number }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, salonId },
      select: {
        id: true,
        salonId: true,
        appointmentId: true,
        status: true,
        provider: true,
        providerPaymentId: true,
        amountCents: true,
        tipCents: true,
        refundedCents: true,
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException({
        message: `Cannot refund a payment in status ${payment.status}`,
        paymentId,
      });
    }
    if (!payment.providerPaymentId) {
      // Shouldn't happen in 5a's flow — every SUCCEEDED row has a
      // payment_intent id by the time the webhook flips it. Guard anyway
      // so a pre-finalised state can't crash the refund call.
      throw new ConflictException(
        "Payment has no provider id yet; webhook hasn't finalised",
      );
    }

    const totalCharged = payment.amountCents + payment.tipCents;
    const requested = input.amountCents ?? totalCharged - payment.refundedCents;
    if (requested <= 0) {
      throw new BadRequestException("Nothing left to refund");
    }
    if (requested > totalCharged - payment.refundedCents) {
      throw new BadRequestException(
        `Refund (${requested}) exceeds remaining balance (${totalCharged - payment.refundedCents})`,
      );
    }

    const result = await this.provider.refundPayment({
      providerPaymentId: payment.providerPaymentId,
      amountCents: requested,
      // Scope idempotency to the refund attempt — Stripe will return the
      // same refund object on retry rather than issuing a second one.
      idempotencyKey: `${payment.id}:refund:${randomUUID()}`,
    });

    // Only update accounting when the provider actually returned the funds.
    // For `pending` (typically ACH), the charge.refunded webhook will fire
    // when the transfer settles and update the row then. For terminal
    // failure modes we surface a 502 so the operator knows nothing
    // happened — without this, the row would be marked REFUNDED with
    // refundedCents bumped even though the customer hasn't been credited.
    if (result.status !== "succeeded") {
      if (result.status === "pending") {
        this.logger.log(
          `Refund ${result.providerRefundId} on Payment ${payment.id} is pending; charge.refunded webhook will finalise.`,
        );
        return {
          providerRefundId: result.providerRefundId,
          refundedCents: payment.refundedCents,
        };
      }
      // failed / canceled / requires_action — refund did not (yet) move
      // any money. Surface to the caller so they don't think the
      // customer was credited.
      this.logger.warn(
        `Refund ${result.providerRefundId} on Payment ${payment.id} returned status=${result.status}; no accounting update.`,
      );
      throw new BadGatewayException({
        message: `Refund did not complete (status: ${result.status})`,
        refundStatus: result.status,
        providerRefundId: result.providerRefundId,
      });
    }

    const newRefundedCents = payment.refundedCents + result.amountCents;
    const fullyRefunded = newRefundedCents >= totalCharged;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: fullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
          refundedCents: newRefundedCents,
        },
      });
      await tx.domainEvent.create({
        data: {
          salonId,
          aggregateType: "PAYMENT",
          aggregateId: payment.id,
          eventType: EventType.PAYMENT_REFUNDED,
          payload: {
            appointmentId: payment.appointmentId,
            providerRefundId: result.providerRefundId,
            amountCents: result.amountCents,
            refundedCentsTotal: newRefundedCents,
            fullyRefunded,
          } satisfies Prisma.InputJsonValue,
          actorType: actorUserId ? ActorType.USER : ActorType.SYSTEM,
          actorId: actorUserId ?? null,
        },
      });
    });

    return {
      providerRefundId: result.providerRefundId,
      refundedCents: newRefundedCents,
    };
  }
}

// SUCCEEDED is the most informative state and should win over a stale
// PENDING / FAILED row from an earlier checkout attempt on the same
// appointment.
function rank(status: PaymentStatus): number {
  switch (status) {
    case PaymentStatus.SUCCEEDED:
      return 5;
    case PaymentStatus.PARTIALLY_REFUNDED:
      return 4;
    case PaymentStatus.REFUNDED:
      return 3;
    case PaymentStatus.FAILED:
      return 2;
    case PaymentStatus.CANCELLED:
      return 1;
    case PaymentStatus.PENDING:
    default:
      return 0;
  }
}

function formatProductName(
  services: string[],
  salonName: string,
): string {
  // Stripe's product_data.name has a 250-char limit. Truncate the
  // service list rather than the salon name — the brand stays visible
  // even on long-package bookings.
  const joined = services.join(", ");
  const tail = ` — ${salonName}`;
  const max = 250 - tail.length;
  const head = joined.length > max ? joined.slice(0, max - 1) + "…" : joined;
  return head + tail;
}
