import { describe, expect, it, vi } from "vitest";
import { PaymentStatus } from "@prisma/client";
import { PaymentsService } from "../src/payments/payments.service";
import type { PaymentProvider } from "../src/payments/payment-provider.interface";

const PAYMENT_ID = "00000000-0000-0000-0000-0000000000e1";

const SALON_ID = "00000000-0000-0000-0000-000000000a01";
const APPOINTMENT_ID = "00000000-0000-0000-0000-000000000b01";
const ACTOR_ID = "00000000-0000-0000-0000-000000000d01";

function fakeAppointment(overrides: Partial<{
  services: { serviceNameSnapshot: string; priceSnapshotCents: number; currencySnapshot: string }[];
}> = {}) {
  return {
    id: APPOINTMENT_ID,
    salonId: SALON_ID,
    clientId: "00000000-0000-0000-0000-000000000c01",
    services: overrides.services ?? [
      {
        serviceNameSnapshot: "Single-process color",
        priceSnapshotCents: 11000,
        currencySnapshot: "USD",
      },
    ],
    salon: { name: "Bella's Salon" },
    client: {
      id: "00000000-0000-0000-0000-000000000c01",
      displayName: "Mira Castellanos",
      email: "mira@example.com",
    },
    staffMember: { displayName: "Trina Bellweather" },
  };
}

function buildService({
  appointment = fakeAppointment(),
  alreadyPaidPayment = null,
  refundTargetPayment = null,
  refundProviderResult = {
    providerRefundId: "re_dev_123",
    status: "succeeded" as const,
    amountCents: 0,
  },
}: {
  appointment?: ReturnType<typeof fakeAppointment> | null;
  alreadyPaidPayment?: { id: string } | null;
  /** Used by .refund() — the row returned by the lookup-before-call. */
  refundTargetPayment?: {
    id: string;
    salonId: string;
    appointmentId: string;
    status: PaymentStatus;
    provider: "STRIPE";
    providerPaymentId: string | null;
    amountCents: number;
    tipCents: number;
    refundedCents: number;
  } | null;
  refundProviderResult?: {
    providerRefundId: string;
    status: "succeeded" | "pending" | "failed" | "canceled" | "requires_action";
    amountCents: number;
  };
} = {}) {
  const createCheckoutSession = vi.fn().mockResolvedValue({
    providerSessionId: "cs_test_dev_123",
    url: "https://stripe.test/cs_test_dev_123",
  });
  const refundPayment = vi.fn().mockResolvedValue(refundProviderResult);
  const provider: PaymentProvider = {
    createCheckoutSession,
    refundPayment,
    verifyAndParseWebhook: vi.fn(),
  };

  const paymentCreate = vi.fn().mockResolvedValue({});
  const paymentUpdate = vi.fn().mockResolvedValue({});
  const domainEventCreate = vi.fn().mockResolvedValue({});

  // findFirst is called once for "is there a SUCCEEDED payment for this
  // appointment already?" in the create-checkout flow, and once for "load
  // the target payment" in the refund flow. We hand back different rows
  // per call site by making the mock context-aware.
  const paymentFindFirst = vi
    .fn()
    .mockImplementation(async (args: { where?: { id?: string; status?: string } }) => {
      if (args.where?.id) return refundTargetPayment;
      return alreadyPaidPayment;
    });

  const prisma = {
    appointment: {
      findFirst: vi.fn().mockResolvedValue(appointment),
    },
    payment: {
      findFirst: paymentFindFirst,
      create: paymentCreate,
      update: paymentUpdate,
    },
    domainEvent: {
      create: domainEventCreate,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaInstance),
    ),
  };
  const prismaInstance = prisma;

  const service = new PaymentsService(prisma as never, provider);
  return {
    service,
    provider,
    createCheckoutSession,
    refundPayment,
    paymentCreate,
    paymentUpdate,
    domainEventCreate,
  };
}

describe("PaymentsService.createCheckoutForAppointment", () => {
  it("creates a session and persists a PENDING Payment row keyed by the same idempotency key", async () => {
    const { service, createCheckoutSession, paymentCreate, domainEventCreate } =
      buildService();

    const result = await service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
      appointmentId: APPOINTMENT_ID,
    });

    expect(result.url).toBe("https://stripe.test/cs_test_dev_123");
    expect(result.paymentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    const sessionCall = createCheckoutSession.mock.calls[0]![0];
    expect(sessionCall.amountCents).toBe(11000);
    expect(sessionCall.tipCents).toBe(0);
    expect(sessionCall.currency).toBe("USD");
    expect(sessionCall.idempotencyKey).toBe(result.paymentId);
    expect(sessionCall.metadata).toMatchObject({
      salonId: SALON_ID,
      appointmentId: APPOINTMENT_ID,
      paymentId: result.paymentId,
    });

    expect(paymentCreate).toHaveBeenCalledTimes(1);
    expect(paymentCreate.mock.calls[0]![0].data).toMatchObject({
      id: result.paymentId,
      salonId: SALON_ID,
      appointmentId: APPOINTMENT_ID,
      status: PaymentStatus.PENDING,
      providerPaymentId: "cs_test_dev_123",
      amountCents: 11000,
      tipCents: 0,
      idempotencyKey: result.paymentId,
    });

    expect(domainEventCreate).toHaveBeenCalledTimes(1);
    expect(domainEventCreate.mock.calls[0]![0].data.eventType).toBe(
      "payment.created",
    );
  });

  it("sums prices across multiple services", async () => {
    const { service, createCheckoutSession } = buildService({
      appointment: fakeAppointment({
        services: [
          {
            serviceNameSnapshot: "Color",
            priceSnapshotCents: 11000,
            currencySnapshot: "USD",
          },
          {
            serviceNameSnapshot: "Cut",
            priceSnapshotCents: 4500,
            currencySnapshot: "USD",
          },
        ],
      }),
    });

    await service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
      appointmentId: APPOINTMENT_ID,
    });

    expect(createCheckoutSession.mock.calls[0]![0].amountCents).toBe(15500);
    expect(createCheckoutSession.mock.calls[0]![0].productName).toContain(
      "Color, Cut",
    );
    expect(createCheckoutSession.mock.calls[0]![0].productName).toContain(
      "Bella's Salon",
    );
  });

  it("rejects when a SUCCEEDED payment already exists for the appointment", async () => {
    const { service, createCheckoutSession, paymentCreate } = buildService({
      alreadyPaidPayment: { id: "existing-payment-id" },
    });

    await expect(
      service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
        appointmentId: APPOINTMENT_ID,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("404s when the appointment is not in this salon", async () => {
    const { service, createCheckoutSession } = buildService({
      appointment: null,
    });

    await expect(
      service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
        appointmentId: APPOINTMENT_ID,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("400s when the appointment has no services to charge for", async () => {
    const { service, createCheckoutSession } = buildService({
      appointment: fakeAppointment({ services: [] }),
    });

    await expect(
      service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
        appointmentId: APPOINTMENT_ID,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("forwards tipCents to the provider and persists it on the row", async () => {
    const { service, createCheckoutSession, paymentCreate, domainEventCreate } =
      buildService();

    await service.createCheckoutForAppointment(SALON_ID, ACTOR_ID, {
      appointmentId: APPOINTMENT_ID,
      tipCents: 1500,
    });

    expect(createCheckoutSession.mock.calls[0]![0].tipCents).toBe(1500);
    // Subtotal stays at 11000; tipCents is the breakdown.
    expect(createCheckoutSession.mock.calls[0]![0].amountCents).toBe(11000);
    expect(paymentCreate.mock.calls[0]![0].data).toMatchObject({
      amountCents: 11000,
      tipCents: 1500,
    });
    expect(domainEventCreate.mock.calls[0]![0].data.payload).toMatchObject({
      amountCents: 11000,
      tipCents: 1500,
    });
  });
});

describe("PaymentsService.refund", () => {
  it("issues a full refund on a SUCCEEDED payment, updates the row, emits payment.refunded", async () => {
    const { service, refundPayment, paymentUpdate, domainEventCreate } =
      buildService({
        refundTargetPayment: {
          id: PAYMENT_ID,
          salonId: SALON_ID,
          appointmentId: APPOINTMENT_ID,
          status: PaymentStatus.SUCCEEDED,
          provider: "STRIPE",
          providerPaymentId: "pi_test_456",
          amountCents: 11000,
          tipCents: 1500,
          refundedCents: 0,
        },
        refundProviderResult: {
          providerRefundId: "re_test_777",
          status: "succeeded",
          amountCents: 12500, // requested = remaining (11000 + 1500)
        },
      });

    const result = await service.refund(SALON_ID, ACTOR_ID, PAYMENT_ID, {});

    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(refundPayment.mock.calls[0]![0]).toMatchObject({
      providerPaymentId: "pi_test_456",
      amountCents: 12500,
    });
    expect(refundPayment.mock.calls[0]![0].idempotencyKey).toMatch(
      new RegExp(`^${PAYMENT_ID}:refund:`),
    );
    expect(result).toMatchObject({
      providerRefundId: "re_test_777",
      refundedCents: 12500,
    });
    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.REFUNDED,
      refundedCents: 12500,
    });
    expect(domainEventCreate.mock.calls[0]![0].data.eventType).toBe(
      "payment.refunded",
    );
  });

  it("flips to PARTIALLY_REFUNDED when the requested amount is below the remaining balance", async () => {
    const { service, paymentUpdate, refundPayment } = buildService({
      refundTargetPayment: {
        id: PAYMENT_ID,
        salonId: SALON_ID,
        appointmentId: APPOINTMENT_ID,
        status: PaymentStatus.SUCCEEDED,
        provider: "STRIPE",
        providerPaymentId: "pi_test_456",
        amountCents: 11000,
        tipCents: 0,
        refundedCents: 0,
      },
      refundProviderResult: {
        providerRefundId: "re_test_partial",
        status: "succeeded",
        amountCents: 5000,
      },
    });

    await service.refund(SALON_ID, ACTOR_ID, PAYMENT_ID, {
      amountCents: 5000,
    });

    expect(refundPayment.mock.calls[0]![0].amountCents).toBe(5000);
    expect(paymentUpdate.mock.calls[0]![0].data).toMatchObject({
      status: PaymentStatus.PARTIALLY_REFUNDED,
      refundedCents: 5000,
    });
  });

  it("409s when the payment isn't SUCCEEDED yet", async () => {
    const { service, refundPayment } = buildService({
      refundTargetPayment: {
        id: PAYMENT_ID,
        salonId: SALON_ID,
        appointmentId: APPOINTMENT_ID,
        status: PaymentStatus.PENDING,
        provider: "STRIPE",
        providerPaymentId: null,
        amountCents: 11000,
        tipCents: 0,
        refundedCents: 0,
      },
    });

    await expect(
      service.refund(SALON_ID, ACTOR_ID, PAYMENT_ID, {}),
    ).rejects.toMatchObject({ status: 409 });

    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("400s when the requested refund exceeds the remaining balance", async () => {
    const { service, refundPayment } = buildService({
      refundTargetPayment: {
        id: PAYMENT_ID,
        salonId: SALON_ID,
        appointmentId: APPOINTMENT_ID,
        status: PaymentStatus.SUCCEEDED,
        provider: "STRIPE",
        providerPaymentId: "pi_test_456",
        amountCents: 11000,
        tipCents: 0,
        refundedCents: 0,
      },
    });

    await expect(
      service.refund(SALON_ID, ACTOR_ID, PAYMENT_ID, {
        amountCents: 999_999,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("404s when the payment doesn't exist in the salon", async () => {
    const { service } = buildService({ refundTargetPayment: null });
    await expect(
      service.refund(SALON_ID, ACTOR_ID, PAYMENT_ID, {}),
    ).rejects.toMatchObject({ status: 404 });
  });
});
