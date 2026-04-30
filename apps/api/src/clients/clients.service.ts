import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MessageChannel, MessageDirection, Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  ClientCreateInput,
  ClientMessagesQuery,
  ClientUpdateInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";

const APPOINTMENT_HISTORY_LIMIT = 50;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_MESSAGES_LIMIT = 100;

// Map outbound OutboxEvent.eventType → human-readable kind. Anything we
// haven't tagged falls back to a generic "Message" so a future event type
// renders sensibly until the matrix catches up.
const OUTBOUND_KIND_BY_EVENT: Record<string, string> = {
  [EventType.APPOINTMENT_CREATED]: "confirmation",
  [EventType.APPOINTMENT_RESCHEDULED]: "reschedule",
  [EventType.APPOINTMENT_CANCELLED]: "cancellation",
  [EventType.APPOINTMENT_REMINDER_DUE]: "reminder",
};

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  // Search is case-insensitive across displayName/phone/email so receptionists
  // can paste in any of the three. When `q` is empty we list everything sorted
  // by display name.
  list(salonId: string, q: string | undefined) {
    const where: Prisma.ClientWhereInput = { salonId };
    if (q && q.trim().length > 0) {
      const term = q.trim();
      where.OR = [
        { displayName: { contains: term, mode: "insensitive" } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
        { email: { contains: term, mode: "insensitive" } },
      ];
    }
    return this.prisma.client.findMany({
      where,
      orderBy: [{ displayName: "asc" }],
      take: 200,
    });
  }

  async get(salonId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, salonId },
    });
    if (!client) throw new NotFoundException("Client not found");

    // Appointment history rolls up here read-only. Phase 3 will populate it
    // for real; the query is correct now and just returns an empty list.
    const appointments = await this.prisma.appointment.findMany({
      where: { salonId, clientId: id },
      orderBy: [{ startAt: "desc" }],
      take: APPOINTMENT_HISTORY_LIMIT,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        staffMember: { select: { id: true, displayName: true } },
        services: {
          select: {
            serviceNameSnapshot: true,
            priceSnapshotCents: true,
            currencySnapshot: true,
          },
        },
      },
    });

    return { ...client, appointments };
  }

  // Read-only message thread for the client profile. Newest first so the
  // top of the page shows the latest exchange. Pagination uses (createdAt, id)
  // as a cursor so ties at the same instant stay stable across pages.
  async listMessages(
    salonId: string,
    clientId: string,
    query: ClientMessagesQuery,
  ) {
    const exists = await this.prisma.client.findFirst({
      where: { id: clientId, salonId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Client not found");

    const limit = Math.min(
      query.limit ?? DEFAULT_MESSAGES_LIMIT,
      MAX_MESSAGES_LIMIT,
    );
    const decoded = query.cursor ? decodeMessagesCursor(query.cursor) : null;

    // Fetch one extra row to detect whether more pages exist without a
    // separate count query.
    //
    // Scope to SMS — the kind heuristics (STOP/YES sniffing, OutboxEvent
    // mapping) are SMS-shaped, and the UI labels this card as SMS history.
    // VOICE / EMAIL Messages would render with the wrong pill kinds.
    const where: Prisma.MessageWhereInput = {
      salonId,
      clientId,
      channel: MessageChannel.SMS,
    };
    if (decoded) {
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.id } },
      ];
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        direction: true,
        status: true,
        body: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        outboxEventId: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Resolve outbound kind from the related OutboxEvent.eventType — more
    // robust than parsing the body, and keeps the formatter free to change.
    const outboxIds = page
      .map((m) => m.outboxEventId)
      .filter((id): id is string => Boolean(id));
    const outboxRows =
      outboxIds.length === 0
        ? []
        : await this.prisma.outboxEvent.findMany({
            where: { id: { in: outboxIds } },
            select: { id: true, eventType: true },
          });
    const eventTypeById = new Map(outboxRows.map((e) => [e.id, e.eventType]));

    const items = page.map((m) => ({
      id: m.id,
      direction: m.direction,
      status: m.status,
      body: m.body,
      createdAt: m.createdAt,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      kind: deriveMessageKind({
        direction: m.direction,
        outboxEventType: m.outboxEventId
          ? eventTypeById.get(m.outboxEventId) ?? null
          : null,
        body: m.body,
      }),
    }));

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeMessagesCursor(last.createdAt, last.id) : null;

    return { items, nextCursor };
  }

  async create(salonId: string, actorUserId: string, input: ClientCreateInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            salonId,
            firstName: input.firstName,
            lastName: input.lastName ?? null,
            displayName: input.displayName,
            email: input.email ?? null,
            phone: input.phone ?? null,
            notes: input.notes ?? null,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "CLIENT",
          aggregateId: client.id,
          eventType: EventType.CLIENT_CREATED,
          payload: clientSnapshot(client),
          actorUserId,
        });
        return client;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Client");
    }
  }

  async update(
    salonId: string,
    actorUserId: string,
    id: string,
    input: ClientUpdateInput,
  ) {
    const existing = await this.prisma.client.findFirst({
      where: { id, salonId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Client not found");

    const data: Prisma.ClientUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.notes !== undefined) data.notes = input.notes;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.update({ where: { id }, data });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "CLIENT",
          aggregateId: client.id,
          eventType: EventType.CLIENT_UPDATED,
          payload: { changes: input, after: clientSnapshot(client) },
          actorUserId,
        });
        return client;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Client");
    }
  }
}

function encodeMessagesCursor(createdAt: Date, id: string): string {
  // Opaque from the caller's perspective. base64url so it survives URL
  // encoding without needing extra escaping.
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString(
    "base64url",
  );
}

function decodeMessagesCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

// Pill kind shown above the bubble. Inbound kind is detected by simple
// keyword sniffing on the body — STOP/UNSUBSCRIBE per A2P 10DLC carrier
// rules, plus a YES/Y heuristic that matches the confirmation prompt
// vocabulary. Anything else stays a plain "reply".
function deriveMessageKind(input: {
  direction: MessageDirection;
  outboxEventType: string | null;
  body: string;
}): string {
  if (input.direction === MessageDirection.OUTBOUND) {
    return (
      (input.outboxEventType && OUTBOUND_KIND_BY_EVENT[input.outboxEventType]) ||
      "outbound"
    );
  }
  const trimmed = input.body.trim().toUpperCase();
  if (
    trimmed === "STOP" ||
    trimmed === "UNSUBSCRIBE" ||
    trimmed === "STOPALL" ||
    trimmed === "CANCEL" ||
    trimmed === "QUIT" ||
    trimmed === "END"
  ) {
    return "opt_out";
  }
  if (trimmed === "Y" || trimmed === "YES" || trimmed === "CONFIRM") {
    return "confirmed";
  }
  return "reply";
}

function clientSnapshot(c: {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
}) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
  };
}

function mapKnownErrors(e: unknown, label: string): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = (e.meta as { target?: string[] | string } | undefined)
        ?.target;
      const field = Array.isArray(target)
        ? target.find((t) => t !== "salonId")
        : target;
      return new ConflictException(
        field
          ? `Another ${label.toLowerCase()} in this salon already uses that ${field}`
          : `${label} already exists for this salon`,
      );
    }
    if (e.code === "P2025") {
      return new NotFoundException(`${label} not found`);
    }
  }
  return e as Error;
}
