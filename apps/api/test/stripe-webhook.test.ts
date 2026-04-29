import { describe, expect, it, vi } from "vitest";
import { PaymentStatus, Prisma } from "@prisma/client";
import { StripeWebhookService } from "../src/webhooks/stripe-webhook.service";
import type { ParsedWebhookEvent } from "../src/payments/payment-provider.interface";

const SALON_ID = "00000000-0000-0000-0000-000000000a01";

const APPOINTMENT_ID = "00000000-0000-0000-0000-000000000b01";

function buildService({
  payment = {
    id: "pay-1",
    salonId: SALON_ID,
    status: PaymentStatus.PENDING,
    appointmentId: APPOINTMENT_ID,
  },
  refundLookupPayment,
  otherSucceededPayment = null,
  processedThrows = null,
}: {
  payment?: {
    id: string;
    salonId: string;
    status: PaymentStatus;
    appointmentId: string | null;
  } | null;
  /** Used by charge.refunded — the row matched by payment_intent id with
   *  the extra fields (amountCents, tipCents, refundedCents) the handler
   *  needs to compute fully-vs-partially-refunded. */
  refundLookupPayment?: {
    id: string;
    salonId: string;
    appointmentId: string | null;
    amountCents: number;
    tipCents: number;
    refundedCents: number;
  } | null;
  /** Another row that has already SUCCEEDED for the same appointment —
   *  used to drive the duplicate-charge defence-in-depth path. */
  otherSucceededPayment?: { id: string } | null;
  processedThrows?: Error | null;
} = {}) {
  const processedCreate = vi.fn().mockImplementation(async () => {
    if (processedThrows) throw processedThrows;
    return {};
  });
  // findFirst is called twice from the success handler:
  //   1. to find the Payment row matching the session.id
  //   2. to check whether ANOTHER SUCCEEDED row exists for the appointment
  // The second call is gated on `succeeded && payment.appointmentId`.
  // For charge.refunded we use refundLookupPayment in the first call and
  // ignore the second.
  const paymentFindFirst = vi
    .fn()
    .mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      // The refund handler queries for { provider, providerPaymentId };
      // the success handler queries the same the first time and then a
      // different shape (NOT + status) for the dup-check.
      if (args.where && "NOT" in args.where) {
        return otherSucceededPayment;
      }
      // First call from either handler. Tri-state: explicit `null` →
      // "no Payment matches" path (refund test); object → use that;
      // undefined → fall back to the success-handler default.
      if (refundLookupPayment !== undefined) return refundLookupPayment;
      return payment;
    });
  const paymentUpdate = vi.fn().mockResolvedValue({});
  const domainEventCreate = vi.fn().mockResolvedValue({});

  const prisma = {
    processedWebhookEvent: { create: processedCreate },
    payment: { findFirst: paymentFindFirst, update: paymentUpdate },
    domainEvent: { create: domainEventCreate },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaInstance),
    ),
  };
  const prismaInstance = prisma;

  const service = new StripeWebhookService(prisma as never);
  return {
    service,
    processedCreate,
    paymentFindFirst,
    paymentUpdate,
    domainEventCreate,
  };
}

const sessionEvent = (
  status: "paid" | "unpaid",
  sid = "cs_test_dev_123",
): ParsedWebhookEvent => ({
  id: "evt_session_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: sid,
      payment_intent: "pi_test_456",
      payment_status: status,
      amount_total: 11000,
      currency: "usd",
    },
  },
});

const failedIntentEvent = (id = "pi_test_456"): ParsedWebhookEvent => ({
  id: "evt_intent_failed",
  type: "payment_intent.payment_failed",
  data: {
    object: {
      id,
      last_payment_error: { message: "card declined" },
    },
  },
});

describe("StripeWebhookService", () => {
  it("marks the Payment SUCCEEDED on checkout.session.completed (paid) and emits payment.succeeded", async () => {
    const { service, paymentUpdate, domainEventCreate } = buildService();

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).toHaveBeenCalledTimes(1);
    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.SUCCEEDED,
      providerPaymentId: "pi_test_456",
    });
    expect(domainEventCreate).toHaveBeenCalledTimes(1);
    expect(domainEventCreate.mock.calls[0]![0].data.eventType).toBe(
      "payment.succeeded",
    );
  });

  it("does not finalise SUCCEEDED when payment_status is unpaid", async () => {
    const { service, paymentUpdate, domainEventCreate } = buildService();

    await service.process(sessionEvent("unpaid"));

    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.PENDING,
    });
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  it("dedupes a re-delivered event (P2002 on processed_webhook_events) without throwing", async () => {
    const dupErr = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "x",
      meta: { target: ["source", "externalEventId"] },
    });
    const { service, paymentUpdate, domainEventCreate } = buildService({
      processedThrows: dupErr,
    });

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  it("ignores a SUCCEEDED payment already finalised by an earlier webhook", async () => {
    const { service, paymentUpdate, domainEventCreate } = buildService({
      payment: {
        id: "pay-1",
        salonId: SALON_ID,
        status: PaymentStatus.SUCCEEDED,
        appointmentId: APPOINTMENT_ID,
      },
    });

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  it("does not double-mark SUCCEEDED when another Payment for the same appointment already succeeded", async () => {
    // Scenario: the customer was sent two checkout links (older one
    // forgotten, newer one used and succeeded first). The older link is
    // then completed afterwards — Stripe captures the second charge and
    // sends checkout.session.completed for it. We must NOT mark a second
    // SUCCEEDED row; instead flag the latecomer for manual refund.
    const { service, paymentUpdate, domainEventCreate } = buildService({
      otherSucceededPayment: { id: "pay-already-succeeded" },
    });

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).toHaveBeenCalledTimes(1);
    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.FAILED,
      failureReason: expect.stringContaining("Duplicate charge"),
    });
    expect(paymentUpdate.mock.calls[0]![0].data.failureReason).toContain(
      "pay-already-succeeded",
    );
    // No payment.succeeded event for the duplicate — it didn't actually
    // succeed from our books' perspective.
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  it("marks Payment FAILED with reason on payment_intent.payment_failed", async () => {
    const { service, paymentUpdate } = buildService();

    await service.process(failedIntentEvent());

    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.FAILED,
      failureReason: "card declined",
    });
  });

  it("does not downgrade a SUCCEEDED row when a stale failed event arrives", async () => {
    const { service, paymentUpdate } = buildService({
      payment: {
        id: "pay-1",
        salonId: SALON_ID,
        status: PaymentStatus.SUCCEEDED,
      },
    });

    await service.process(failedIntentEvent());

    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it("logs and skips when no Payment row matches (handler does not throw)", async () => {
    const { service, paymentUpdate } = buildService({ payment: null });

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it("ignores unhandled event types (disputes — deferred)", async () => {
    const { service, paymentUpdate, domainEventCreate } = buildService();

    await service.process({
      id: "evt_dispute_1",
      type: "charge.dispute.created",
      data: { object: { id: "du_x" } },
    });

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  describe("charge.refunded", () => {
    const refundEvent = (overrides: {
      amount_refunded: number;
      payment_intent?: string;
    }) => ({
      id: `evt_refund_${overrides.amount_refunded}`,
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test_001",
          payment_intent: overrides.payment_intent ?? "pi_test_456",
          amount: 12500,
          amount_refunded: overrides.amount_refunded,
        },
      },
    });

    it("flips to REFUNDED when fully refunded and emits payment.refunded", async () => {
      const { service, paymentUpdate, domainEventCreate } = buildService({
        refundLookupPayment: {
          id: "pay-1",
          salonId: SALON_ID,
          appointmentId: APPOINTMENT_ID,
          amountCents: 11000,
          tipCents: 1500,
          refundedCents: 0,
        },
      });

      await service.process(refundEvent({ amount_refunded: 12500 }));

      expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
        status: PaymentStatus.REFUNDED,
        refundedCents: 12500,
      });
      expect(domainEventCreate.mock.calls[0]![0].data.eventType).toBe(
        "payment.refunded",
      );
    });

    it("flips to PARTIALLY_REFUNDED when only some money came back", async () => {
      const { service, paymentUpdate } = buildService({
        refundLookupPayment: {
          id: "pay-1",
          salonId: SALON_ID,
          appointmentId: APPOINTMENT_ID,
          amountCents: 11000,
          tipCents: 0,
          refundedCents: 0,
        },
      });

      await service.process(refundEvent({ amount_refunded: 5000 }));

      expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
        status: PaymentStatus.PARTIALLY_REFUNDED,
        refundedCents: 5000,
      });
    });

    it("no-ops when the refund total is already accounted for (race / re-delivery)", async () => {
      const { service, paymentUpdate, domainEventCreate } = buildService({
        refundLookupPayment: {
          id: "pay-1",
          salonId: SALON_ID,
          appointmentId: APPOINTMENT_ID,
          amountCents: 11000,
          tipCents: 0,
          refundedCents: 11000,
        },
      });

      await service.process(refundEvent({ amount_refunded: 11000 }));

      expect(paymentUpdate).not.toHaveBeenCalled();
      expect(domainEventCreate).not.toHaveBeenCalled();
    });

    it("logs and skips when no Payment matches the payment_intent", async () => {
      const { service, paymentUpdate } = buildService({
        refundLookupPayment: null,
      });

      await service.process(refundEvent({ amount_refunded: 12500 }));

      expect(paymentUpdate).not.toHaveBeenCalled();
    });
  });
});
