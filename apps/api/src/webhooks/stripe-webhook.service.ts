import { Injectable, Logger } from "@nestjs/common";
import { ActorType, PaymentStatus, Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { ParsedWebhookEvent } from "../payments/payment-provider.interface";

const SOURCE = "stripe";

// Subset of Stripe payload shapes we read. Stripe's full types live behind
// the `Stripe` namespace (heavy import); typing the bits we care about
// keeps this file readable and avoids leaking Stripe types past the
// provider boundary.
interface CheckoutSessionPayload {
  id: string;
  payment_intent?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string | undefined> | null;
}

interface PaymentIntentPayload {
  id: string;
  last_payment_error?: { message?: string | null } | null;
  metadata?: Record<string, string | undefined> | null;
}

/**
 * Applies a verified Stripe event to our Payment rows. Wraps each handler
 * in a transaction that:
 *   1. Inserts a `processed_webhook_events` row keyed on (source, eventId).
 *   2. Performs the side effect.
 *
 * The (source, externalEventId) unique constraint makes Stripe re-deliveries
 * a no-op — a P2002 from the insert means we've seen this event before.
 *
 * Refunds + disputes intentionally skipped — those land in 5c.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(event: ParsedWebhookEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: {
            source: SOURCE,
            externalEventId: event.id,
            eventType: event.type,
          },
        });
        await this.apply(tx, event);
      });
    } catch (err) {
      if (isProcessedWebhookEventDuplicate(err)) {
        this.logger.log(`Stripe event ${event.id} already processed; skipping`);
        return;
      }
      throw err;
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    event: ParsedWebhookEvent,
  ): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        // payload.object is the standard Stripe shape; we tolerate the
        // raw event body too in case a caller bypasses the wrapping.
        const session = unwrap<CheckoutSessionPayload>(event.data);
        if (!session?.id) {
          this.logger.warn(
            `Stripe checkout.session.completed event ${event.id} missing session id — skipping`,
          );
          return;
        }
        const payment = await tx.payment.findFirst({
          where: { provider: "STRIPE", providerPaymentId: session.id },
          select: { id: true, salonId: true, status: true },
        });
        if (!payment) {
          this.logger.warn(
            `Stripe checkout.session ${session.id} has no matching Payment row — skipping`,
          );
          return;
        }
        if (payment.status === PaymentStatus.SUCCEEDED) {
          // Late-arriving duplicate of a status we already finalised.
          // Don't re-emit the domain event.
          return;
        }
        const succeeded = session.payment_status === "paid";
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: succeeded ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
            // Once we have the underlying payment_intent we replace the
            // session id with it so future refund webhooks correlate.
            providerPaymentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.id,
            capturedAt: succeeded ? new Date() : null,
          },
        });
        if (succeeded) {
          await tx.domainEvent.create({
            data: {
              salonId: payment.salonId,
              aggregateType: "PAYMENT",
              aggregateId: payment.id,
              eventType: EventType.PAYMENT_SUCCEEDED,
              payload: {
                providerSessionId: session.id,
                providerPaymentIntentId:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : null,
                amountTotal: session.amount_total ?? null,
                currency: session.currency ?? null,
              } satisfies Prisma.InputJsonValue,
              actorType: ActorType.WEBHOOK,
            },
          });
        }
        return;
      }

      case "payment_intent.payment_failed": {
        const intent = unwrap<PaymentIntentPayload>(event.data);
        if (!intent?.id) {
          this.logger.warn(
            `Stripe payment_intent.payment_failed event ${event.id} missing intent id — skipping`,
          );
          return;
        }
        // Match on payment_intent id (set by the checkout.session.completed
        // handler) OR fall back to metadata.paymentId in case the intent
        // failed before we ever saw a session.completed.
        const payment = await tx.payment.findFirst({
          where: {
            OR: [
              { provider: "STRIPE", providerPaymentId: intent.id },
              ...(intent.metadata?.paymentId
                ? [{ id: intent.metadata.paymentId }]
                : []),
            ],
          },
          select: { id: true, salonId: true, status: true },
        });
        if (!payment) {
          this.logger.warn(
            `Stripe payment_intent ${intent.id} has no matching Payment row — skipping`,
          );
          return;
        }
        if (payment.status === PaymentStatus.SUCCEEDED) {
          // Stripe occasionally delivers a stale failed event after a
          // successful retry. Don't downgrade a SUCCEEDED row.
          return;
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason:
              intent.last_payment_error?.message?.slice(0, 500) ?? null,
          },
        });
        return;
      }

      default:
        this.logger.log(
          `Stripe event ${event.id} (${event.type}) not handled — ignoring`,
        );
        return;
    }
  }
}

// Stripe wraps the resource we care about under `event.data.object`.
// Some (dev / synthetic) callers send the resource directly under
// `event.data` — accept both so the dev provider can drive this
// without faking the Stripe wrapper.
function unwrap<T>(data: unknown): T | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as { object?: T } & T;
  if (d.object && typeof d.object === "object") return d.object;
  return d as T;
}

function isProcessedWebhookEventDuplicate(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const meta = err.meta as { target?: string | string[] } | undefined;
    if (!meta?.target) return false;
    const t = meta.target;
    return Array.isArray(t)
      ? t.some((c) => c.includes("source") || c.includes("externalEventId"))
      : t.includes("source") || t.includes("externalEventId");
  }
  return false;
}
