import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentStatus, MessageStatus, Prisma } from "@prisma/client";
import { SmsHandlersService } from "../src/messaging/sms-handlers.service";
import type { MessagingProvider } from "../src/messaging/messaging-provider.interface";

// Mock prisma + messaging provider so the handler can run end-to-end without
// a database. The goal is to assert the flow control around send + dedup,
// not Prisma's behavior.

const SALON_ID = "00000000-0000-0000-0000-000000000a01";
const APPOINTMENT_ID = "00000000-0000-0000-0000-000000000b01";
const CLIENT_ID = "00000000-0000-0000-0000-000000000c01";
const STAFF_ID = "00000000-0000-0000-0000-000000000d01";

function fakeAppointment(overrides: Partial<{ status: AppointmentStatus; phone: string | null }> = {}) {
  return {
    id: APPOINTMENT_ID,
    salonId: SALON_ID,
    clientId: CLIENT_ID,
    staffMemberId: STAFF_ID,
    startAt: new Date("2026-04-30T17:00:00Z"),
    endAt: new Date("2026-04-30T18:30:00Z"),
    status: overrides.status ?? AppointmentStatus.SCHEDULED,
    client: {
      id: CLIENT_ID,
      displayName: "Mira Castellanos",
      phone: overrides.phone === undefined ? "+15555550192" : overrides.phone,
    },
    staffMember: { id: STAFF_ID, displayName: "Trina Bellweather" },
    services: [
      { serviceNameSnapshot: "Single-process color", durationSnapshotMinutes: 90 },
    ],
  };
}

function buildHandler({
  appointment,
  messageRowId = "00000000-0000-0000-0000-000000000e01",
  existingMessage = null,
  insertThrows = null,
}: {
  appointment?: ReturnType<typeof fakeAppointment> | null;
  messageRowId?: string;
  existingMessage?: { id: string; providerMessageId: string | null } | null;
  insertThrows?: Error | null;
}) {
  const sendSms = vi.fn().mockResolvedValue({
    providerMessageId: "SM_test_sid",
    status: "SENT" as const,
  });
  const messaging: MessagingProvider = {
    sendSms,
    validateInboundSignature: () => true,
  };

  const messageCreate = vi.fn().mockImplementation(async () => {
    if (insertThrows) throw insertThrows;
    return { id: messageRowId };
  });
  const messageFindUnique = vi.fn().mockResolvedValue(existingMessage);
  const messageUpdate = vi.fn().mockResolvedValue({});
  const domainEventCreate = vi.fn().mockResolvedValue({});

  const prisma = {
    appointment: {
      findFirst: vi.fn().mockResolvedValue(appointment ?? null),
    },
    salon: {
      findUnique: vi.fn().mockResolvedValue({
        name: "Bella's Salon",
        timezone: "America/New_York",
      }),
    },
    message: {
      create: messageCreate,
      findUnique: messageFindUnique,
      update: messageUpdate,
    },
    domainEvent: {
      create: domainEventCreate,
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      // Pass the mock prisma itself as the tx so calls inside the
      // transaction route to the same spies.
      return fn(prismaInstance);
    }),
  };
  // Self-reference so $transaction can pass `prisma` as `tx`.
  const prismaInstance = prisma;

  const handler = new SmsHandlersService(prisma as never, messaging);
  return { handler, prisma, sendSms, messageCreate, messageFindUnique, messageUpdate, domainEventCreate };
}

beforeEach(() => {
  process.env.TWILIO_FROM_NUMBER = "+15555550100";
  process.env.MESSAGING_PROVIDER = "dev";
});

describe("SmsHandlersService.handleAppointmentCreated", () => {
  const event = {
    id: "00000000-0000-0000-0000-000000000f01",
    eventType: "appointment.created",
    payload: { id: APPOINTMENT_ID, salonId: SALON_ID } as Prisma.JsonValue,
  };

  it("sends a confirmation SMS for a fresh event", async () => {
    const { handler, sendSms, messageCreate, messageUpdate, domainEventCreate } =
      buildHandler({ appointment: fakeAppointment() });

    await handler.handleAppointmentCreated(event);

    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0]![0].data).toMatchObject({
      salonId: SALON_ID,
      clientId: CLIENT_ID,
      direction: "OUTBOUND",
      status: MessageStatus.QUEUED,
      toAddress: "+15555550192",
      fromAddress: "+15555550100",
      outboxEventId: event.id,
    });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0]![0]).toMatchObject({
      to: "+15555550192",
      from: "+15555550100",
    });
    expect(messageUpdate).toHaveBeenCalledTimes(1);
    expect(messageUpdate.mock.calls[0]![0].data).toMatchObject({
      providerMessageId: "SM_test_sid",
      status: MessageStatus.SENT,
    });
    expect(domainEventCreate).toHaveBeenCalledTimes(1);
    expect(domainEventCreate.mock.calls[0]![0].data.eventType).toBe(
      "message.sms_sent",
    );
  });

  it("does not double-send when retried after a successful send (outboxEventId dedup)", async () => {
    const dupErr = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      { code: "P2002", clientVersion: "x", meta: { target: "messages_outboxEventId_key" } },
    );
    const { handler, sendSms, messageCreate, messageFindUnique, domainEventCreate } =
      buildHandler({
        appointment: fakeAppointment(),
        insertThrows: dupErr,
        existingMessage: {
          id: "existing-id",
          providerMessageId: "SM_already_sent",
        },
      });

    await handler.handleAppointmentCreated(event);

    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageFindUnique).toHaveBeenCalledTimes(1);
    expect(sendSms).not.toHaveBeenCalled();
    expect(domainEventCreate).not.toHaveBeenCalled();
  });

  it("re-sends when a previous attempt crashed mid-flight (no providerMessageId yet)", async () => {
    const dupErr = new Prisma.PrismaClientKnownRequestError(
      "duplicate",
      { code: "P2002", clientVersion: "x", meta: { target: "messages_outboxEventId_key" } },
    );
    const { handler, sendSms, messageCreate, messageFindUnique, messageUpdate } =
      buildHandler({
        appointment: fakeAppointment(),
        insertThrows: dupErr,
        existingMessage: {
          id: "existing-id",
          providerMessageId: null,
        },
      });

    await handler.handleAppointmentCreated(event);

    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageFindUnique).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(messageUpdate).toHaveBeenCalledTimes(1);
    expect(messageUpdate.mock.calls[0]![0].where.id).toBe("existing-id");
  });

  it("skips cancelled appointments without sending", async () => {
    const { handler, sendSms, messageCreate } = buildHandler({
      appointment: fakeAppointment({ status: AppointmentStatus.CANCELLED }),
    });

    await handler.handleAppointmentCreated(event);

    expect(messageCreate).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("skips when the client has no phone on file", async () => {
    const { handler, sendSms, messageCreate } = buildHandler({
      appointment: fakeAppointment({ phone: null }),
    });

    await handler.handleAppointmentCreated(event);

    expect(messageCreate).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("marks the Message FAILED and re-throws when the provider errors", async () => {
    const { handler, sendSms, messageUpdate, domainEventCreate } = buildHandler({
      appointment: fakeAppointment(),
    });
    sendSms.mockRejectedValueOnce(new Error("Twilio 503"));

    await expect(handler.handleAppointmentCreated(event)).rejects.toThrow(
      "Twilio 503",
    );

    expect(messageUpdate).toHaveBeenCalledTimes(1);
    expect(messageUpdate.mock.calls[0]![0].data).toMatchObject({
      status: MessageStatus.FAILED,
      errorMessage: expect.stringContaining("Twilio 503"),
    });
    expect(domainEventCreate).not.toHaveBeenCalled();
  });
});
