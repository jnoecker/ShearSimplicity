import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentSource as AppointmentSourceEnum,
  AppointmentStatus as AppointmentStatusEnum,
  OutboxStatus,
  Prisma,
} from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  AppointmentCancelInput,
  AppointmentCompleteInput,
  AppointmentCreateInput,
  AppointmentListQueryInput,
  AppointmentNotesUpdateInput,
  AppointmentRescheduleInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";
import {
  BLOCKING_STATUSES,
  canCancel,
  canReschedule,
  canTransition,
} from "./state-machine";

// Hard cap to keep range queries bounded. A month of appointments per stylist
// is a generous upper bound for the calendar UI; longer ranges should paginate.
const RANGE_QUERY_MAX_DAYS = 62;

const APPOINTMENT_INCLUDE = {
  client: { select: { id: true, displayName: true, phone: true, email: true } },
  staffMember: { select: { id: true, displayName: true, color: true } },
  services: {
    orderBy: [{ sortOrder: "asc" as const }],
    select: {
      id: true,
      serviceId: true,
      serviceNameSnapshot: true,
      priceSnapshotCents: true,
      durationSnapshotMinutes: true,
      currencySnapshot: true,
      actualMinutes: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(salonId: string, query: AppointmentListQueryInput) {
    if (query.to <= query.from) {
      throw new BadRequestException("`to` must be after `from`");
    }
    const rangeDays =
      (query.to.getTime() - query.from.getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > RANGE_QUERY_MAX_DAYS) {
      throw new BadRequestException(
        `Range too large; max ${RANGE_QUERY_MAX_DAYS} days`,
      );
    }

    const where: Prisma.AppointmentWhereInput = {
      salonId,
      // Half-open interval [from, to). An appointment overlaps the window iff
      // it starts before `to` and ends after `from`.
      startAt: { lt: query.to },
      endAt: { gt: query.from },
    };
    if (query.staffMemberId) where.staffMemberId = query.staffMemberId;
    if (query.status && query.status.length > 0) {
      where.status = { in: query.status as AppointmentStatusEnum[] };
    }

    return this.prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ startAt: "asc" }],
    });
  }

  async get(salonId: string, id: string): Promise<AppointmentWithRelations> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, salonId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appt) throw new NotFoundException("Appointment not found");
    return appt;
  }

  async create(
    salonId: string,
    actorUserId: string,
    input: AppointmentCreateInput,
  ) {
    // Verify client + staff + services up front so failures surface as 404 /
    // 400 rather than as Prisma FK errors deep inside the transaction.
    const [client, staff, services] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id: input.clientId, salonId },
        select: { id: true },
      }),
      this.prisma.staffMember.findFirst({
        where: { id: input.staffMemberId, salonId, isActive: true },
        select: { id: true },
      }),
      this.prisma.service.findMany({
        where: { id: { in: input.serviceIds }, salonId },
        select: {
          id: true,
          name: true,
          defaultDurationMinutes: true,
          defaultPriceCents: true,
          currency: true,
          isActive: true,
        },
      }),
    ]);

    if (!client) throw new NotFoundException("Client not found");
    if (!staff) throw new NotFoundException("Staff member not found or inactive");
    if (services.length !== input.serviceIds.length) {
      throw new NotFoundException("One or more services not found in this salon");
    }
    if (services.some((s) => !s.isActive)) {
      throw new BadRequestException("Cannot book inactive services");
    }

    // Order the snapshots in the request order so receptionists see services
    // listed the way they entered them.
    const orderedServices = input.serviceIds
      .map((id) => services.find((s) => s.id === id))
      .filter((s): s is (typeof services)[number] => Boolean(s));
    const totalDuration = orderedServices.reduce(
      (acc, s) => acc + s.defaultDurationMinutes,
      0,
    );
    const startAt = input.startAt;
    const endAt = new Date(startAt.getTime() + totalDuration * 60_000);

    await this.assertNoStylistConflict({
      salonId,
      staffMemberId: input.staffMemberId,
      startAt,
      endAt,
    });

    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          salonId,
          clientId: input.clientId,
          staffMemberId: input.staffMemberId,
          startAt,
          endAt,
          status: AppointmentStatusEnum.SCHEDULED,
          source: input.source ?? AppointmentSourceEnum.STAFF,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          createdById: actorUserId,
          services: {
            // salonId is not a settable field on AppointmentService nested
            // creates — Prisma derives it from the parent appointment via the
            // composite FK. Including it raises "Unknown argument salonId"
            // at runtime even though TS doesn't catch the excess prop in
            // .map() callbacks.
            create: orderedServices.map((s, i) => ({
              serviceId: s.id,
              serviceNameSnapshot: s.name,
              priceSnapshotCents: s.defaultPriceCents,
              durationSnapshotMinutes: s.defaultDurationMinutes,
              currencySnapshot: s.currency,
              sortOrder: i,
            })),
          },
        },
        include: APPOINTMENT_INCLUDE,
      });

      const eventPayload = appointmentSnapshot(appointment);
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT",
        aggregateId: appointment.id,
        eventType: EventType.APPOINTMENT_CREATED,
        payload: eventPayload,
        actorUserId,
      });
      // Outbox row for downstream side-effects (Phase 4 wires the SMS
      // confirmation handler). The worker is a noop today; the row exists
      // because the contract is "events ride along the same transaction".
      await tx.outboxEvent.create({
        data: {
          salonId,
          eventType: EventType.APPOINTMENT_CREATED,
          payload: eventPayload as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
        },
      });
      return appointment;
    });
  }

  async reschedule(
    salonId: string,
    actorUserId: string,
    id: string,
    input: AppointmentRescheduleInput,
  ) {
    const existing = await this.get(salonId, id);
    if (!canReschedule(existing.status)) {
      throw new ConflictException(
        `Cannot reschedule an appointment in status ${existing.status}`,
      );
    }

    const targetStaffId = input.staffMemberId ?? existing.staffMemberId;
    if (input.staffMemberId && input.staffMemberId !== existing.staffMemberId) {
      const staff = await this.prisma.staffMember.findFirst({
        where: { id: input.staffMemberId, salonId, isActive: true },
        select: { id: true },
      });
      if (!staff) {
        throw new NotFoundException("Staff member not found or inactive");
      }
    }

    // Preserve duration: rescheduling moves the block, it doesn't resize it.
    // Resize is "edit services", which is a different verb (and isn't in 3a).
    const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
    const newStart = input.startAt;
    const newEnd = new Date(newStart.getTime() + durationMs);

    await this.assertNoStylistConflict({
      salonId,
      staffMemberId: targetStaffId,
      startAt: newStart,
      endAt: newEnd,
      excludeAppointmentId: id,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          startAt: newStart,
          endAt: newEnd,
          ...(input.staffMemberId && input.staffMemberId !== existing.staffMemberId
            ? {
                staffMember: {
                  connect: {
                    staff_members_id_salonId_key: {
                      id: input.staffMemberId,
                      salonId,
                    },
                  },
                },
              }
            : {}),
        },
        include: APPOINTMENT_INCLUDE,
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT",
        aggregateId: id,
        eventType: EventType.APPOINTMENT_RESCHEDULED,
        payload: {
          before: {
            startAt: existing.startAt,
            endAt: existing.endAt,
            staffMemberId: existing.staffMemberId,
          },
          after: {
            startAt: updated.startAt,
            endAt: updated.endAt,
            staffMemberId: updated.staffMemberId,
          },
        },
        actorUserId,
      });
      return updated;
    });
  }

  async cancel(
    salonId: string,
    actorUserId: string,
    id: string,
    input: AppointmentCancelInput,
  ) {
    const existing = await this.get(salonId, id);
    if (!canCancel(existing.status)) {
      throw new ConflictException(
        `Cannot cancel an appointment in status ${existing.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatusEnum.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: input.reason ?? null,
        },
        include: APPOINTMENT_INCLUDE,
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT",
        aggregateId: id,
        eventType: EventType.APPOINTMENT_CANCELLED,
        payload: {
          previousStatus: existing.status,
          reason: input.reason ?? null,
        },
        actorUserId,
      });
      return updated;
    });
  }

  async transition(
    salonId: string,
    actorUserId: string,
    id: string,
    target: AppointmentStatusEnum,
  ) {
    const existing = await this.get(salonId, id);
    if (!canTransition(existing.status, target)) {
      throw new ConflictException(
        `Cannot transition from ${existing.status} to ${target}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: target },
        include: APPOINTMENT_INCLUDE,
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT",
        aggregateId: id,
        eventType: eventTypeForTransition(target),
        payload: { from: existing.status, to: target },
        actorUserId,
      });
      return updated;
    });
  }

  async complete(
    salonId: string,
    actorUserId: string,
    id: string,
    input: AppointmentCompleteInput,
  ) {
    const existing = await this.get(salonId, id);
    if (!canTransition(existing.status, AppointmentStatusEnum.COMPLETED)) {
      throw new ConflictException(
        `Cannot complete an appointment in status ${existing.status}`,
      );
    }

    const now = new Date();
    const actualStart = input.actualStartAt ?? existing.startAt;
    const actualEnd = input.actualEndAt ?? now;
    if (actualEnd <= actualStart) {
      throw new BadRequestException("actualEndAt must be after actualStartAt");
    }
    const actualDurationMinutes = Math.max(
      1,
      Math.round((actualEnd.getTime() - actualStart.getTime()) / 60_000),
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatusEnum.COMPLETED,
          actualStartAt: actualStart,
          actualEndAt: actualEnd,
          actualDurationMinutes,
        },
        include: APPOINTMENT_INCLUDE,
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT",
        aggregateId: id,
        eventType: EventType.APPOINTMENT_COMPLETED,
        payload: {
          actualStartAt: actualStart,
          actualEndAt: actualEnd,
          actualDurationMinutes,
        },
        actorUserId,
      });
      return updated;
    });
  }

  // Notes are mutable metadata, not state. No domain event today — if note
  // history becomes a requirement later, swap to an event-sourced edit.
  async updateNotes(
    salonId: string,
    id: string,
    input: AppointmentNotesUpdateInput,
  ) {
    await this.get(salonId, id);
    const data: Prisma.AppointmentUpdateInput = {};
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.internalNotes !== undefined) data.internalNotes = input.internalNotes;
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: APPOINTMENT_INCLUDE,
    });
  }

  // Find an existing appointment that overlaps [startAt, endAt) on the same
  // stylist with a blocking status. Two appointments overlap iff
  //   existing.startAt < newEnd  AND  existing.endAt > newStart.
  private async assertNoStylistConflict(args: {
    salonId: string;
    staffMemberId: string;
    startAt: Date;
    endAt: Date;
    excludeAppointmentId?: string;
  }) {
    if (args.endAt <= args.startAt) {
      throw new BadRequestException("Appointment endAt must be after startAt");
    }
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        salonId: args.salonId,
        staffMemberId: args.staffMemberId,
        status: { in: BLOCKING_STATUSES as AppointmentStatusEnum[] },
        startAt: { lt: args.endAt },
        endAt: { gt: args.startAt },
        ...(args.excludeAppointmentId
          ? { NOT: { id: args.excludeAppointmentId } }
          : {}),
      },
      select: { id: true, startAt: true, endAt: true },
    });
    if (conflict) {
      throw new ConflictException(
        `Stylist already booked from ${conflict.startAt.toISOString()} to ${conflict.endAt.toISOString()}`,
      );
    }
  }
}

function eventTypeForTransition(target: AppointmentStatusEnum): string {
  switch (target) {
    case AppointmentStatusEnum.CONFIRMED:
      return EventType.APPOINTMENT_CONFIRMED;
    case AppointmentStatusEnum.CHECKED_IN:
      return EventType.APPOINTMENT_CHECKED_IN;
    case AppointmentStatusEnum.IN_PROGRESS:
      return EventType.APPOINTMENT_STARTED;
    case AppointmentStatusEnum.NO_SHOW:
      return EventType.APPOINTMENT_NO_SHOWED;
    default:
      return `appointment.${target.toLowerCase()}`;
  }
}

function appointmentSnapshot(a: AppointmentWithRelations) {
  return {
    id: a.id,
    salonId: a.salonId,
    clientId: a.clientId,
    staffMemberId: a.staffMemberId,
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
    source: a.source,
    services: a.services.map((s) => ({
      serviceId: s.serviceId,
      name: s.serviceNameSnapshot,
      priceCents: s.priceSnapshotCents,
      durationMinutes: s.durationSnapshotMinutes,
      currency: s.currencySnapshot,
    })),
  };
}
