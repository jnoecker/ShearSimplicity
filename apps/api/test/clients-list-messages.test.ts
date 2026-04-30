import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageDirection, MessageStatus } from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { ClientsService } from "../src/clients/clients.service";

const SALON_ID = "00000000-0000-0000-0000-000000000a01";
const CLIENT_ID = "00000000-0000-0000-0000-000000000c01";

interface MessageRow {
  id: string;
  direction: MessageDirection;
  status: MessageStatus;
  body: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  outboxEventId: string | null;
}

function buildService({
  clientExists = true,
  messages = [] as MessageRow[],
  outboxEvents = [] as Array<{ id: string; eventType: string }>,
}: {
  clientExists?: boolean;
  messages?: MessageRow[];
  outboxEvents?: Array<{ id: string; eventType: string }>;
}) {
  const messageFindMany = vi.fn().mockImplementation(async (args: {
    take: number;
    where: { OR?: Array<{ createdAt: { lt: Date } | Date; id?: { lt: string } }> };
  }) => {
    // Apply the cursor predicate manually so this mock mirrors what Prisma
    // would do — keeps the cursor encode/decode logic under test honest.
    let filtered = messages;
    if (args.where.OR) {
      const [a, b] = args.where.OR;
      const ltDate = (a!.createdAt as { lt: Date }).lt;
      const eqDate = b!.createdAt as Date;
      const ltId = (b!.id as { lt: string }).lt;
      filtered = messages.filter(
        (m) =>
          m.createdAt.getTime() < ltDate.getTime() ||
          (m.createdAt.getTime() === eqDate.getTime() && m.id < ltId),
      );
    }
    const sorted = [...filtered].sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      return t !== 0 ? t : b.id.localeCompare(a.id);
    });
    return sorted.slice(0, args.take);
  });

  const prisma = {
    client: {
      findFirst: vi.fn().mockResolvedValue(clientExists ? { id: CLIENT_ID } : null),
    },
    message: { findMany: messageFindMany },
    outboxEvent: {
      findMany: vi.fn().mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
        const ids = new Set(args.where.id.in);
        return outboxEvents.filter((e) => ids.has(e.id));
      }),
    },
  };

  const service = new ClientsService(prisma as never);
  return { service, prisma };
}

function makeMessage(overrides: Partial<MessageRow> & { id: string }): MessageRow {
  return {
    direction: MessageDirection.OUTBOUND,
    status: MessageStatus.SENT,
    body: "hello",
    createdAt: new Date("2026-04-29T12:00:00Z"),
    sentAt: new Date("2026-04-29T12:00:01Z"),
    deliveredAt: null,
    outboxEventId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClientsService.listMessages", () => {
  it("404s when the client doesn't belong to the salon", async () => {
    const { service } = buildService({ clientExists: false });
    await expect(
      service.listMessages(SALON_ID, CLIENT_ID, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes the query to SMS so VOICE / EMAIL rows can't leak in", async () => {
    const { service, prisma } = buildService({ messages: [] });
    await service.listMessages(SALON_ID, CLIENT_ID, {});
    const findManyArgs = (prisma.message.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: { channel?: string; salonId?: string; clientId?: string } };
    expect(findManyArgs.where).toMatchObject({
      salonId: SALON_ID,
      clientId: CLIENT_ID,
      channel: "SMS",
    });
  });

  it("returns messages newest-first with a kind derived from the related outbox event", async () => {
    const { service } = buildService({
      messages: [
        makeMessage({
          id: "00000000-0000-0000-0000-000000000001",
          createdAt: new Date("2026-04-29T08:00:00Z"),
          outboxEventId: "00000000-0000-0000-0000-0000000000a1",
          body: "Confirmation body",
        }),
        makeMessage({
          id: "00000000-0000-0000-0000-000000000002",
          createdAt: new Date("2026-04-29T10:00:00Z"),
          outboxEventId: "00000000-0000-0000-0000-0000000000a2",
          body: "Reminder body",
        }),
        makeMessage({
          id: "00000000-0000-0000-0000-000000000003",
          createdAt: new Date("2026-04-29T11:00:00Z"),
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
          body: "Y",
          outboxEventId: null,
        }),
      ],
      outboxEvents: [
        { id: "00000000-0000-0000-0000-0000000000a1", eventType: "appointment.created" },
        { id: "00000000-0000-0000-0000-0000000000a2", eventType: "appointment.reminder_due" },
      ],
    });

    const result = await service.listMessages(SALON_ID, CLIENT_ID, {});

    expect(result.items.map((m) => m.id)).toEqual([
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000001",
    ]);
    expect(result.items.map((m) => m.kind)).toEqual([
      "confirmed",
      "reminder",
      "confirmation",
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("flags inbound STOP as opt_out", async () => {
    const { service } = buildService({
      messages: [
        makeMessage({
          id: "00000000-0000-0000-0000-000000000010",
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
          body: "STOP",
          outboxEventId: null,
        }),
      ],
    });
    const result = await service.listMessages(SALON_ID, CLIENT_ID, {});
    expect(result.items[0]!.kind).toBe("opt_out");
  });

  it("returns a nextCursor when more rows are available and decodes it on the next call", async () => {
    const messages: MessageRow[] = Array.from({ length: 5 }, (_, i) =>
      makeMessage({
        id: `00000000-0000-0000-0000-00000000010${i}`,
        createdAt: new Date(2026, 3, 29, 10, i),
        body: `body ${i}`,
      }),
    );
    const { service } = buildService({ messages });

    const page1 = await service.listMessages(SALON_ID, CLIENT_ID, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items.map((m) => m.id)).toEqual([
      "00000000-0000-0000-0000-000000000104",
      "00000000-0000-0000-0000-000000000103",
    ]);

    const page2 = await service.listMessages(SALON_ID, CLIENT_ID, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((m) => m.id)).toEqual([
      "00000000-0000-0000-0000-000000000102",
      "00000000-0000-0000-0000-000000000101",
    ]);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = await service.listMessages(SALON_ID, CLIENT_ID, {
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items.map((m) => m.id)).toEqual([
      "00000000-0000-0000-0000-000000000100",
    ]);
    expect(page3.nextCursor).toBeNull();
  });

  it("treats an unparseable cursor as a fresh query rather than throwing", async () => {
    const { service } = buildService({
      messages: [
        makeMessage({ id: "00000000-0000-0000-0000-0000000000ff" }),
      ],
    });
    const result = await service.listMessages(SALON_ID, CLIENT_ID, {
      cursor: "not-a-real-cursor",
    });
    expect(result.items).toHaveLength(1);
  });
});
