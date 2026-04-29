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
  otherSucceededPayment = null,
  processedThrows = null,
}: {
  payment?: {
    id: string;
    salonId: string;
    status: PaymentStatus;
    appointmentId: string | null;
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
  const paymentFindFirst = vi
    .fn()
    .mockResolvedValueOnce(payment)
    .mockResolvedValue(otherSucceededPayment);
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

  it("ignores unhandled event types (refunds, disputes — deferred to 5c)", async () => {
    const { service, paymentUpdate, domainEventCreate } = buildService();

    await service.process({
      id: "evt_refund_1",
      type: "charge.refunded",
      data: { object: { id: "ch_x" } },
    });

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(domainEventCreate).not.toHaveBeenCalled();
  });
});
