import { describe, expect, it, vi } from "vitest";
import { PaymentStatus } from "@prisma/client";
import { PaymentsService } from "../src/payments/payments.service";
import type { PaymentProvider } from "../src/payments/payment-provider.interface";

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
}: {
  appointment?: ReturnType<typeof fakeAppointment> | null;
  alreadyPaidPayment?: { id: string } | null;
} = {}) {
  const createCheckoutSession = vi.fn().mockResolvedValue({
    providerSessionId: "cs_test_dev_123",
    url: "https://stripe.test/cs_test_dev_123",
  });
  const provider: PaymentProvider = {
    createCheckoutSession,
    verifyAndParseWebhook: vi.fn(),
  };

  const paymentCreate = vi.fn().mockResolvedValue({});
  const domainEventCreate = vi.fn().mockResolvedValue({});

  const prisma = {
    appointment: {
      findFirst: vi.fn().mockResolvedValue(appointment),
    },
    payment: {
      findFirst: vi.fn().mockResolvedValue(alreadyPaidPayment),
      create: paymentCreate,
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
  return { service, provider, createCheckoutSession, paymentCreate, domainEventCreate };
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
});
