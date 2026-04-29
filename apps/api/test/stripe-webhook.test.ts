import { describe, expect, it, vi } from "vitest";
import { PaymentStatus, Prisma } from "@prisma/client";
import { StripeWebhookService } from "../src/webhooks/stripe-webhook.service";
import type { ParsedWebhookEvent } from "../src/payments/payment-provider.interface";

const SALON_ID = "00000000-0000-0000-0000-000000000a01";

function buildService({
  payment = { id: "pay-1", salonId: SALON_ID, status: PaymentStatus.PENDING },
  processedThrows = null,
}: {
  payment?: { id: string; salonId: string; status: PaymentStatus } | null;
  processedThrows?: Error | null;
} = {}) {
  const processedCreate = vi.fn().mockImplementation(async () => {
    if (processedThrows) throw processedThrows;
    return {};
  });
  const paymentFindFirst = vi.fn().mockResolvedValue(payment);
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
      },
    });

    await service.process(sessionEvent("paid"));

    expect(paymentUpdate).not.toHaveBeenCalled();
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
