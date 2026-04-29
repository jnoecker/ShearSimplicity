import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  StaffCreateInput,
  StaffUpdateInput,
  WorkingHoursReplaceInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(salonId: string) {
    return this.prisma.staffMember.findMany({
      where: { salonId },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    });
  }

  async get(salonId: string, id: string) {
    const staff = await this.prisma.staffMember.findFirst({
      where: { id, salonId },
      include: {
        workingHours: {
          orderBy: [
            { dayOfWeek: "asc" },
            { startMinutesFromMidnight: "asc" },
          ],
        },
      },
    });
    if (!staff) throw new NotFoundException("Staff member not found");
    return staff;
  }

  async create(salonId: string, actorUserId: string, input: StaffCreateInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const staff = await tx.staffMember.create({
          data: {
            salonId,
            displayName: input.displayName,
            title: input.title ?? null,
            color: input.color ?? null,
            bio: input.bio ?? null,
            isActive: input.isActive ?? true,
            userId: input.userId ?? null,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "STAFF_MEMBER",
          aggregateId: staff.id,
          eventType: EventType.STAFF_CREATED,
          payload: snapshot(staff),
          actorUserId,
        });
        return staff;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Staff member");
    }
  }

  async update(
    salonId: string,
    actorUserId: string,
    id: string,
    input: StaffUpdateInput,
  ) {
    // Verify ownership before update so a cross-tenant id surfaces as 404
    // rather than a generic Prisma "record not found".
    await this.get(salonId, id);

    const data: Prisma.StaffMemberUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.title !== undefined) data.title = input.title;
    if (input.color !== undefined) data.color = input.color;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const staff = await tx.staffMember.update({
          where: { id },
          data,
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "STAFF_MEMBER",
          aggregateId: staff.id,
          eventType: EventType.STAFF_UPDATED,
          payload: { changes: input, after: snapshot(staff) },
          actorUserId,
        });
        return staff;
      });
    } catch (e) {
      throw mapKnownErrors(e, "Staff member");
    }
  }

  async replaceWorkingHours(
    salonId: string,
    actorUserId: string,
    staffId: string,
    input: WorkingHoursReplaceInput,
  ) {
    await this.get(salonId, staffId);

    return this.prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({
        where: { salonId, staffMemberId: staffId },
      });
      if (input.windows.length > 0) {
        await tx.workingHours.createMany({
          data: input.windows.map((w) => ({
            salonId,
            staffMemberId: staffId,
            dayOfWeek: w.dayOfWeek,
            startMinutesFromMidnight: w.startMinutesFromMidnight,
            endMinutesFromMidnight: w.endMinutesFromMidnight,
          })),
        });
      }
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "STAFF_MEMBER",
        aggregateId: staffId,
        eventType: EventType.WORKING_HOURS_UPDATED,
        payload: { windows: input.windows },
        actorUserId,
      });
      return tx.workingHours.findMany({
        where: { salonId, staffMemberId: staffId },
        orderBy: [
          { dayOfWeek: "asc" },
          { startMinutesFromMidnight: "asc" },
        ],
      });
    });
  }
}

function snapshot(staff: {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  isActive: boolean;
  userId: string | null;
}) {
  return {
    id: staff.id,
    displayName: staff.displayName,
    title: staff.title,
    color: staff.color,
    isActive: staff.isActive,
    userId: staff.userId,
  };
}

// Translate Prisma's known errors into HTTP-shaped exceptions the controller
// can return verbatim.
function mapKnownErrors(e: unknown, label: string): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return new ConflictException(`${label} already exists for this salon`);
    }
    if (e.code === "P2025") {
      return new NotFoundException(`${label} not found`);
    }
  }
  return e as Error;
}
