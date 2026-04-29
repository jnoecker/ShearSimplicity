import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
  /** Optional override of the post-payment redirect; falls back to a route on
   *  WEB_ORIGIN that the frontend handles. Stripe requires both URLs. */
  successUrl?: string;
  cancelUrl?: string;
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

    const amountCents = appointment.services.reduce(
      (acc, s) => acc + s.priceSnapshotCents,
      0,
    );
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
      amountCents,
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
          amountCents,
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
            amountCents,
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
