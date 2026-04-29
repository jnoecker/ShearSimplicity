import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  ClientCreateInput,
  ClientUpdateInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";

const APPOINTMENT_HISTORY_LIMIT = 50;

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
