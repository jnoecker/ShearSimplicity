import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentSeriesStatus as AppointmentSeriesStatusEnum,
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

// How far in advance the reminder SMS fires. The actual schedule lives in
// `OutboxEvent.nextAttemptAt`, which the existing worker already polls — no
// separate scheduler needed. If startAt is less than this far away (or
// already past) the row's nextAttemptAt is in the past and the worker fires
// it on its next tick.
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

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
      // Outbox row driving the confirmation SMS (Phase 4a).
      await tx.outboxEvent.create({
        data: {
          salonId,
          eventType: EventType.APPOINTMENT_CREATED,
          payload: eventPayload as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
        },
      });
      // Outbox row driving the 24h reminder SMS (Phase 4b-2). nextAttemptAt
      // is in the past for same-day bookings — that's fine, the worker
      // fires it on the next tick.
      await tx.outboxEvent.create({
        data: {
          salonId,
          eventType: EventType.APPOINTMENT_REMINDER_DUE,
          payload: {
            id: appointment.id,
            salonId,
          } as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
          nextAttemptAt: new Date(startAt.getTime() - REMINDER_LEAD_MS),
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

    // Cascade reschedule onto every future occurrence in the same series.
    // The delta we apply is in raw milliseconds — wall-clock-preserving math
    // here would be wrong: the user dragged the block to a specific instant,
    // so future occurrences shift by the same instant-delta. The series
    // anchor's wall-clock time is updated below so subsequent top-offs use
    // the new pattern.
    const isSeriesCascade =
      input.scope === "following" && existing.seriesId !== null;
    if (isSeriesCascade && existing.seriesIndex === null) {
      // Defensive: a row with seriesId must have seriesIndex too. If the
      // invariant is broken, fall back to a single-occurrence reschedule
      // rather than silently shifting nothing.
      throw new ConflictException(
        "Cannot cascade-reschedule: appointment is missing seriesIndex",
      );
    }

    const cascadeRows = isSeriesCascade
      ? await this.prisma.appointment.findMany({
          where: {
            salonId,
            seriesId: existing.seriesId!,
            seriesIndex: { gte: existing.seriesIndex! },
            status: {
              in: [
                AppointmentStatusEnum.SCHEDULED,
                AppointmentStatusEnum.CONFIRMED,
              ],
            },
          },
          select: {
            id: true,
            seriesIndex: true,
            startAt: true,
            endAt: true,
            staffMemberId: true,
          },
          orderBy: [{ seriesIndex: "asc" }],
        })
      : [];

    const deltaMs = newStart.getTime() - existing.startAt.getTime();
    const cascadeUpdates = cascadeRows.map((row) => ({
      id: row.id,
      seriesIndex: row.seriesIndex!,
      previousStartAt: row.startAt,
      newStartAt: new Date(row.startAt.getTime() + deltaMs),
      newEndAt: new Date(row.endAt.getTime() + deltaMs),
    }));

    // Conflict-check the moved row(s). For a single reschedule, that's just
    // this appointment in its new slot. For a cascade, every shifted row.
    if (isSeriesCascade) {
      for (const u of cascadeUpdates) {
        await this.assertNoStylistConflict({
          salonId,
          staffMemberId: targetStaffId,
          startAt: u.newStartAt,
          endAt: u.newEndAt,
          excludeAppointmentId: u.id,
        });
      }
    } else {
      await this.assertNoStylistConflict({
        salonId,
        staffMemberId: targetStaffId,
        startAt: newStart,
        endAt: newEnd,
        excludeAppointmentId: id,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const staffConnect =
        input.staffMemberId && input.staffMemberId !== existing.staffMemberId
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
          : {};

      let updated;
      if (isSeriesCascade && cascadeUpdates.length > 0) {
        // Apply the same delta to every shifted occurrence and emit per-row
        // events so each customer's SMS still fires with their correct old
        // and new times.
        for (const u of cascadeUpdates) {
          const before = await tx.appointment.findUniqueOrThrow({
            where: { id: u.id },
            select: { startAt: true, endAt: true, staffMemberId: true },
          });
          await tx.appointment.update({
            where: { id: u.id },
            data: {
              startAt: u.newStartAt,
              endAt: u.newEndAt,
              ...staffConnect,
            },
          });
          await appendDomainEvent(tx, {
            salonId,
            aggregateType: "APPOINTMENT",
            aggregateId: u.id,
            eventType: EventType.APPOINTMENT_RESCHEDULED,
            payload: {
              before: {
                startAt: before.startAt,
                endAt: before.endAt,
                staffMemberId: before.staffMemberId,
              },
              after: {
                startAt: u.newStartAt,
                endAt: u.newEndAt,
                staffMemberId: targetStaffId,
              },
              cascadedFromSeriesIndex: existing.seriesIndex,
            } as Prisma.InputJsonValue,
            actorUserId,
          });
          await tx.outboxEvent.create({
            data: {
              salonId,
              eventType: EventType.APPOINTMENT_RESCHEDULED,
              payload: {
                id: u.id,
                salonId,
                previousStartAt: u.previousStartAt.toISOString(),
              } as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
          await tx.outboxEvent.updateMany({
            where: {
              eventType: EventType.APPOINTMENT_REMINDER_DUE,
              status: OutboxStatus.PENDING,
              salonId,
              payload: { path: ["id"], equals: u.id },
            },
            data: {
              nextAttemptAt: new Date(
                u.newStartAt.getTime() - REMINDER_LEAD_MS,
              ),
            },
          });
        }

        // Reset the series anchor so future top-offs continue at the new
        // pattern. anchorIndex tracks which occurrence the new anchor maps
        // to; the cadence helper computes occurrence M as
        // anchor + (M - anchorIndex) * everyNWeeks weeks.
        await tx.appointmentSeries.update({
          where: { id: existing.seriesId! },
          data: {
            anchorStartAt: newStart,
            anchorIndex: existing.seriesIndex!,
            ...(input.staffMemberId &&
            input.staffMemberId !== existing.staffMemberId
              ? { staffMemberId: input.staffMemberId }
              : {}),
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "APPOINTMENT_SERIES",
          aggregateId: existing.seriesId!,
          eventType: EventType.APPOINTMENT_SERIES_RESCHEDULED,
          payload: {
            fromSeriesIndex: existing.seriesIndex,
            deltaMs,
            shiftedOccurrences: cascadeUpdates.length,
            newStaffMemberId: input.staffMemberId ?? null,
          } as Prisma.InputJsonValue,
          actorUserId,
        });
        updated = await tx.appointment.findUniqueOrThrow({
          where: { id },
          include: APPOINTMENT_INCLUDE,
        });
      } else {
        updated = await tx.appointment.update({
          where: { id },
          data: {
            startAt: newStart,
            endAt: newEnd,
            ...staffConnect,
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
        // Outbox row drives the reschedule SMS in 4b-1. Minimal payload: id +
        // salonId + previousStartAt. The handler looks up the appointment for
        // current state (new startAt, services, staff) and uses
        // previousStartAt only for the "moved from X to Y" wording.
        await tx.outboxEvent.create({
          data: {
            salonId,
            eventType: EventType.APPOINTMENT_RESCHEDULED,
            payload: {
              id,
              salonId,
              previousStartAt: existing.startAt.toISOString(),
            } as Prisma.InputJsonValue,
            status: OutboxStatus.PENDING,
          },
        });
        // Move the still-pending reminder forward (or back) to match the new
        // startAt. updateMany skips rows that have already fired (status !=
        // PENDING), which is the correct behaviour — once a reminder went
        // out for the old time, we can't unsend it.
        await tx.outboxEvent.updateMany({
          where: {
            eventType: EventType.APPOINTMENT_REMINDER_DUE,
            status: OutboxStatus.PENDING,
            salonId,
            payload: { path: ["id"], equals: id },
          },
          data: {
            nextAttemptAt: new Date(
              updated.startAt.getTime() - REMINDER_LEAD_MS,
            ),
          },
        });
      }
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

    // Cascade: cancel this occurrence + all future + end the series. We
    // bundle it inline (rather than delegating to AppointmentSeriesService)
    // because we need the same transactional guarantees the single-cancel
    // path provides, and the SeriesService method only walks future
    // occurrences with startAt > now — it would skip the row the user
    // actually clicked on if it was already in progress (which canCancel
    // already disallowed) or in the past few seconds.
    if (input.scope === "following" && existing.seriesId !== null) {
      return this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const future = await tx.appointment.findMany({
          where: {
            salonId,
            seriesId: existing.seriesId!,
            seriesIndex: { gte: existing.seriesIndex ?? 0 },
            status: {
              in: [
                AppointmentStatusEnum.SCHEDULED,
                AppointmentStatusEnum.CONFIRMED,
                AppointmentStatusEnum.CHECKED_IN,
                AppointmentStatusEnum.IN_PROGRESS,
              ],
            },
          },
          select: { id: true, status: true },
        });
        for (const appt of future) {
          if (!canCancel(appt.status)) continue;
          await tx.appointment.update({
            where: { id: appt.id },
            data: {
              status: AppointmentStatusEnum.CANCELLED,
              cancelledAt: now,
              cancellationReason: input.reason ?? "Series ended",
            },
          });
          await appendDomainEvent(tx, {
            salonId,
            aggregateType: "APPOINTMENT",
            aggregateId: appt.id,
            eventType: EventType.APPOINTMENT_CANCELLED,
            payload: {
              previousStatus: appt.status,
              reason: input.reason ?? "Series ended",
              cascadedFromSeries: existing.seriesId,
            } as Prisma.InputJsonValue,
            actorUserId,
          });
          await tx.outboxEvent.create({
            data: {
              salonId,
              eventType: EventType.APPOINTMENT_CANCELLED,
              payload: { id: appt.id, salonId } as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
          await tx.outboxEvent.updateMany({
            where: {
              eventType: EventType.APPOINTMENT_REMINDER_DUE,
              status: OutboxStatus.PENDING,
              salonId,
              payload: { path: ["id"], equals: appt.id },
            },
            data: {
              status: OutboxStatus.COMPLETED,
              processedAt: now,
            },
          });
        }
        // Suppress the next top-off and flip the series to CANCELLED.
        await tx.outboxEvent.updateMany({
          where: {
            eventType: EventType.APPOINTMENT_SERIES_TOP_OFF_DUE,
            status: OutboxStatus.PENDING,
            salonId,
            payload: { path: ["seriesId"], equals: existing.seriesId! },
          },
          data: {
            status: OutboxStatus.COMPLETED,
            processedAt: now,
          },
        });
        await tx.appointmentSeries.update({
          where: { id: existing.seriesId! },
          data: {
            status: AppointmentSeriesStatusEnum.CANCELLED,
            cancelledAt: now,
          },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "APPOINTMENT_SERIES",
          aggregateId: existing.seriesId!,
          eventType: EventType.APPOINTMENT_SERIES_CANCELLED,
          payload: {
            reason: input.reason ?? null,
            cancelledOccurrences: future.length,
            cascadedFromAppointment: id,
          } as Prisma.InputJsonValue,
          actorUserId,
        });
        return tx.appointment.findUniqueOrThrow({
          where: { id },
          include: APPOINTMENT_INCLUDE,
        });
      });
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
      // Outbox row drives the cancel SMS in 4b-1. Cancel doesn't move the
      // appointment, so no previousStartAt is needed — the handler reads
      // the current row's startAt for the "appointment on X has been
      // cancelled" wording.
      await tx.outboxEvent.create({
        data: {
          salonId,
          eventType: EventType.APPOINTMENT_CANCELLED,
          payload: { id, salonId } as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
        },
      });
      // Suppress any still-pending reminder. We complete the row rather
      // than delete it so the audit trail (and the worker's metrics)
      // still see what was scheduled.
      await tx.outboxEvent.updateMany({
        where: {
          eventType: EventType.APPOINTMENT_REMINDER_DUE,
          status: OutboxStatus.PENDING,
          salonId,
          payload: { path: ["id"], equals: id },
        },
        data: {
          status: OutboxStatus.COMPLETED,
          processedAt: new Date(),
        },
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
