import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentSeriesStatus as AppointmentSeriesStatusEnum,
  AppointmentSource as AppointmentSourceEnum,
  AppointmentStatus as AppointmentStatusEnum,
  OutboxStatus,
  Prisma,
  type OutboxEvent,
} from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type {
  AppointmentSeriesCancelInput,
  AppointmentSeriesCreateInput,
  AppointmentSeriesExtendInput,
} from "@shearsimp/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendDomainEvent } from "../common/domain-events";
import { occurrenceRange } from "./cadence";

// How many future occurrences we keep materialized at any time. 12 weeks of
// buffer means the top-off worker can be down for days without the calendar
// running dry, and 12 rows per series is trivial write amplification.
const MATERIALIZE_AHEAD = 12;
// Trigger another top-off when fewer than this many future occurrences remain.
const TOP_OFF_THRESHOLD = 4;
// How long to wait between top-off attempts for an active series. A weekly
// cadence is ample given the buffer above and keeps the outbox light.
const TOP_OFF_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// Same lead time the appointments service uses for one-off bookings.
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

const SERIES_INCLUDE = {
  client: { select: { id: true, displayName: true, phone: true, email: true } },
  staffMember: { select: { id: true, displayName: true, color: true } },
  services: {
    orderBy: [{ sortOrder: "asc" as const }],
    select: { id: true, serviceId: true, sortOrder: true },
  },
} satisfies Prisma.AppointmentSeriesInclude;

@Injectable()
export class AppointmentSeriesService {
  private readonly logger = new Logger(AppointmentSeriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(salonId: string, id: string) {
    const series = await this.prisma.appointmentSeries.findFirst({
      where: { id, salonId },
      include: SERIES_INCLUDE,
    });
    if (!series) throw new NotFoundException("Series not found");
    return series;
  }

  // Create a new series + materialize the initial batch of occurrences in
  // one transaction. First-occurrence conflicts surface as 409 like normal
  // bookings; subsequent materialized rows skip conflict checks (they're
  // weeks out, the operator can resolve overlaps in the calendar UI).
  async create(
    salonId: string,
    actorUserId: string,
    input: AppointmentSeriesCreateInput,
  ) {
    const [client, staff, services, salon] = await Promise.all([
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
      this.prisma.salon.findUnique({
        where: { id: salonId },
        select: { timezone: true },
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
    if (!salon) {
      throw new NotFoundException("Salon not found");
    }

    const orderedServices = input.serviceIds
      .map((id) => services.find((s) => s.id === id))
      .filter((s): s is (typeof services)[number] => Boolean(s));
    const durationMinutes = orderedServices.reduce(
      (acc, s) => acc + s.defaultDurationMinutes,
      0,
    );

    const initialCount = Math.min(
      MATERIALIZE_AHEAD,
      input.stopAfterVisits ?? MATERIALIZE_AHEAD,
    );
    const occurrences = occurrenceRange({
      anchorStartAt: input.startAt,
      anchorIndex: 1,
      everyNWeeks: input.everyNWeeks,
      startIndex: 1,
      count: initialCount,
      timeZone: salon.timezone,
    });

    // First occurrence is the user-driven booking — fail hard if the stylist
    // is double-booked there. The customer is sitting in front of you; pick
    // a different start time.
    const firstStart = occurrences[0].startAt;
    const firstEnd = new Date(firstStart.getTime() + durationMinutes * 60_000);
    const firstConflict = await this.prisma.appointment.findFirst({
      where: {
        salonId,
        staffMemberId: input.staffMemberId,
        status: {
          in: [
            AppointmentStatusEnum.SCHEDULED,
            AppointmentStatusEnum.CONFIRMED,
            AppointmentStatusEnum.CHECKED_IN,
            AppointmentStatusEnum.IN_PROGRESS,
            AppointmentStatusEnum.COMPLETED,
          ],
        },
        startAt: { lt: firstEnd },
        endAt: { gt: firstStart },
      },
      select: { id: true, startAt: true, endAt: true },
    });
    if (firstConflict) {
      throw new ConflictException(
        `Stylist already booked from ${firstConflict.startAt.toISOString()} to ${firstConflict.endAt.toISOString()}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.appointmentSeries.create({
        data: {
          salonId,
          clientId: input.clientId,
          staffMemberId: input.staffMemberId,
          anchorStartAt: input.startAt,
          anchorIndex: 1,
          durationMinutes,
          everyNWeeks: input.everyNWeeks,
          stopAfterVisits: input.stopAfterVisits,
          status: AppointmentSeriesStatusEnum.ACTIVE,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          createdById: actorUserId,
          services: {
            create: orderedServices.map((s, i) => ({
              salonId,
              serviceId: s.id,
              sortOrder: i,
            })),
          },
        },
      });

      for (const occ of occurrences) {
        const startAt = occ.startAt;
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
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
            seriesId: series.id,
            seriesIndex: occ.seriesIndex,
            services: {
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
        });
        // Mirror the one-off booking outbox events: confirmation SMS for the
        // first occurrence (the rest are not surprising — the customer just
        // signed up for the recurrence), reminder for every occurrence.
        if (occ.seriesIndex === 1) {
          await tx.outboxEvent.create({
            data: {
              salonId,
              eventType: EventType.APPOINTMENT_CREATED,
              payload: {
                id: appointment.id,
                salonId,
              } as Prisma.InputJsonValue,
              status: OutboxStatus.PENDING,
            },
          });
        }
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
      }

      // For finite series whose initial materialization covers all visits we
      // skip top-off scheduling — there's nothing left to add.
      const exhausted =
        input.stopAfterVisits !== null &&
        initialCount >= (input.stopAfterVisits ?? Number.POSITIVE_INFINITY);
      if (!exhausted) {
        await tx.outboxEvent.create({
          data: {
            salonId,
            eventType: EventType.APPOINTMENT_SERIES_TOP_OFF_DUE,
            payload: {
              seriesId: series.id,
              salonId,
            } as Prisma.InputJsonValue,
            status: OutboxStatus.PENDING,
            nextAttemptAt: new Date(Date.now() + TOP_OFF_INTERVAL_MS),
          },
        });
      }

      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT_SERIES",
        aggregateId: series.id,
        eventType: EventType.APPOINTMENT_SERIES_CREATED,
        payload: {
          everyNWeeks: input.everyNWeeks,
          stopAfterVisits: input.stopAfterVisits,
          firstStartAt: input.startAt.toISOString(),
          initialOccurrences: initialCount,
        } as Prisma.InputJsonValue,
        actorUserId,
      });

      return tx.appointmentSeries.findFirstOrThrow({
        where: { id: series.id, salonId },
        include: SERIES_INCLUDE,
      });
    });
  }

  // Cancel the entire series: flips status, cancels every future
  // non-terminal occurrence, suppresses their pending reminders, and
  // suppresses the next top-off. Past appointments (already completed,
  // checked-in, etc.) are left alone — those happened.
  async cancelSeries(
    salonId: string,
    actorUserId: string,
    seriesId: string,
    input: AppointmentSeriesCancelInput,
  ) {
    const series = await this.get(salonId, seriesId);
    if (series.status !== AppointmentSeriesStatusEnum.ACTIVE) {
      throw new ConflictException(
        `Cannot cancel a series in status ${series.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Find future cancellable occurrences. We list them first so we can
      // emit per-appointment SMS and domain events; updateMany would be
      // faster but skip the per-row notifications.
      const future = await tx.appointment.findMany({
        where: {
          salonId,
          seriesId,
          status: {
            in: [
              AppointmentStatusEnum.SCHEDULED,
              AppointmentStatusEnum.CONFIRMED,
            ],
          },
          startAt: { gt: now },
        },
        select: { id: true },
      });

      for (const appt of future) {
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
            previousStatus: AppointmentStatusEnum.SCHEDULED,
            reason: input.reason ?? "Series ended",
            cascadedFromSeries: seriesId,
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
        // Suppress the still-pending reminder.
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

      // Suppress the next top-off so the worker doesn't re-materialize a
      // cancelled series.
      await tx.outboxEvent.updateMany({
        where: {
          eventType: EventType.APPOINTMENT_SERIES_TOP_OFF_DUE,
          status: OutboxStatus.PENDING,
          salonId,
          payload: { path: ["seriesId"], equals: seriesId },
        },
        data: {
          status: OutboxStatus.COMPLETED,
          processedAt: now,
        },
      });

      const updated = await tx.appointmentSeries.update({
        where: { id: seriesId },
        data: {
          status: AppointmentSeriesStatusEnum.CANCELLED,
          cancelledAt: now,
        },
        include: SERIES_INCLUDE,
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT_SERIES",
        aggregateId: seriesId,
        eventType: EventType.APPOINTMENT_SERIES_CANCELLED,
        payload: {
          reason: input.reason ?? null,
          cancelledOccurrences: future.length,
        } as Prisma.InputJsonValue,
        actorUserId,
      });
      return updated;
    });
  }

  // Extend a finite series by N more visits. Indefinite series have no cap
  // to extend — calling this is a 400. Bumps stopAfterVisits, flips
  // COMPLETED back to ACTIVE if relevant, and ensures a top-off is queued.
  async extend(
    salonId: string,
    actorUserId: string,
    seriesId: string,
    input: AppointmentSeriesExtendInput,
  ) {
    const series = await this.get(salonId, seriesId);
    if (series.status === AppointmentSeriesStatusEnum.CANCELLED) {
      throw new ConflictException("Cannot extend a cancelled series");
    }
    if (series.stopAfterVisits === null) {
      throw new BadRequestException(
        "Indefinite series have no cap to extend — they continue until cancelled",
      );
    }
    const newCap = series.stopAfterVisits + input.additionalVisits;
    if (newCap > 52) {
      throw new BadRequestException(
        "stopAfterVisits cannot exceed 52 — convert to indefinite instead",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointmentSeries.update({
        where: { id: seriesId },
        data: {
          stopAfterVisits: newCap,
          status: AppointmentSeriesStatusEnum.ACTIVE,
        },
        include: SERIES_INCLUDE,
      });
      // Make sure a top-off is queued so the additional occurrences get
      // materialized. If one's already pending the dedup is fine — the
      // handler is idempotent.
      await tx.outboxEvent.create({
        data: {
          salonId,
          eventType: EventType.APPOINTMENT_SERIES_TOP_OFF_DUE,
          payload: {
            seriesId,
            salonId,
          } as Prisma.InputJsonValue,
          status: OutboxStatus.PENDING,
          // Run on the next tick — the operator just clicked extend and is
          // looking at the calendar.
          nextAttemptAt: new Date(),
        },
      });
      await appendDomainEvent(tx, {
        salonId,
        aggregateType: "APPOINTMENT_SERIES",
        aggregateId: seriesId,
        eventType: EventType.APPOINTMENT_SERIES_EXTENDED,
        payload: {
          additionalVisits: input.additionalVisits,
          newStopAfterVisits: newCap,
        } as Prisma.InputJsonValue,
        actorUserId,
      });
      return updated;
    });
  }

  // Outbox handler: top up the series' future-occurrence buffer. Skip
  // conflict checks here — these are calendar entries weeks out; if a
  // walk-in lands in the same slot, the calendar UI shows the overlap and
  // the operator resolves manually. Re-enqueues itself for the next
  // interval if the series remains active.
  async handleTopOffDue(event: OutboxEvent): Promise<void> {
    const payload = (event.payload ?? {}) as { seriesId?: string; salonId?: string };
    const seriesId = payload.seriesId;
    const salonId = payload.salonId;
    if (!seriesId || !salonId) {
      this.logger.warn(
        `${event.eventType} event ${event.id} missing seriesId/salonId — skipping`,
      );
      return;
    }

    const series = await this.prisma.appointmentSeries.findFirst({
      where: { id: seriesId, salonId },
      include: {
        services: {
          orderBy: [{ sortOrder: "asc" as const }],
          select: { serviceId: true, sortOrder: true },
        },
      },
    });
    if (!series) {
      this.logger.warn(`top-off skipped: series ${seriesId} not found`);
      return;
    }
    if (series.status !== AppointmentSeriesStatusEnum.ACTIVE) {
      // Cancelled / completed series don't get re-materialized or re-queued.
      // The outbox row completes and that's the end of the chain.
      return;
    }

    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { timezone: true },
    });
    if (!salon) {
      this.logger.warn(`top-off skipped: salon ${salonId} not found`);
      return;
    }

    // Look up materialized occurrences to figure out what's already there,
    // what the highest seriesIndex is, and how many future SCHEDULED
    // occurrences remain.
    const allOccurrences = await this.prisma.appointment.findMany({
      where: { salonId, seriesId },
      select: {
        id: true,
        seriesIndex: true,
        status: true,
        startAt: true,
      },
      orderBy: [{ seriesIndex: "asc" }],
    });
    const now = new Date();
    const highestIndex = allOccurrences.reduce(
      (acc, o) => Math.max(acc, o.seriesIndex ?? 0),
      0,
    );
    const futureCount = allOccurrences.filter(
      (o) =>
        (o.status === AppointmentStatusEnum.SCHEDULED ||
          o.status === AppointmentStatusEnum.CONFIRMED) &&
        o.startAt > now,
    ).length;

    let materializedCount = 0;
    if (futureCount < TOP_OFF_THRESHOLD) {
      // How many more do we add? Bring the future buffer back to
      // MATERIALIZE_AHEAD, but never exceed stopAfterVisits if finite.
      const toAdd = MATERIALIZE_AHEAD - futureCount;
      const cap =
        series.stopAfterVisits === null
          ? Number.POSITIVE_INFINITY
          : series.stopAfterVisits - highestIndex;
      const count = Math.max(0, Math.min(toAdd, cap));
      if (count > 0) {
        // Re-fetch services with the snapshot fields needed to materialize
        // an Appointment row (price, duration, etc.).
        const serviceIds = series.services.map((s) => s.serviceId);
        const services = await this.prisma.service.findMany({
          where: { id: { in: serviceIds }, salonId },
          select: {
            id: true,
            name: true,
            defaultDurationMinutes: true,
            defaultPriceCents: true,
            currency: true,
            isActive: true,
          },
        });
        if (services.length !== serviceIds.length) {
          this.logger.warn(
            `top-off skipped: series ${seriesId} references services that no longer exist; flipping series to CANCELLED`,
          );
          await this.prisma.appointmentSeries.update({
            where: { id: seriesId },
            data: {
              status: AppointmentSeriesStatusEnum.CANCELLED,
              cancelledAt: now,
            },
          });
          return;
        }
        const orderedServices = series.services
          .map((s) => services.find((svc) => svc.id === s.serviceId))
          .filter((s): s is (typeof services)[number] => Boolean(s));
        const occurrences = occurrenceRange({
          anchorStartAt: series.anchorStartAt,
          anchorIndex: series.anchorIndex,
          everyNWeeks: series.everyNWeeks,
          startIndex: highestIndex + 1,
          count,
          timeZone: salon.timezone,
        });
        await this.prisma.$transaction(async (tx) => {
          for (const occ of occurrences) {
            const startAt = occ.startAt;
            const endAt = new Date(
              startAt.getTime() + series.durationMinutes * 60_000,
            );
            const appointment = await tx.appointment.create({
              data: {
                salonId,
                clientId: series.clientId,
                staffMemberId: series.staffMemberId,
                startAt,
                endAt,
                status: AppointmentStatusEnum.SCHEDULED,
                source: AppointmentSourceEnum.STAFF,
                notes: series.notes,
                internalNotes: series.internalNotes,
                createdById: series.createdById,
                seriesId: series.id,
                seriesIndex: occ.seriesIndex,
                services: {
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
            });
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
          }
        });
        materializedCount = occurrences.length;
      }
    }

    // Did we just hit the finite cap? Flip to COMPLETED so subsequent top-offs
    // exit early. The outbox row itself completes via the worker; we don't
    // re-enqueue a top-off in this case.
    const newHighestIndex = highestIndex + materializedCount;
    const willHitCap =
      series.stopAfterVisits !== null &&
      newHighestIndex >= series.stopAfterVisits;
    if (willHitCap) {
      await this.prisma.$transaction(async (tx) => {
        await tx.appointmentSeries.update({
          where: { id: seriesId },
          data: { status: AppointmentSeriesStatusEnum.COMPLETED },
        });
        await appendDomainEvent(tx, {
          salonId,
          aggregateType: "APPOINTMENT_SERIES",
          aggregateId: seriesId,
          eventType: EventType.APPOINTMENT_SERIES_COMPLETED,
          payload: {
            totalOccurrences: newHighestIndex,
          } as Prisma.InputJsonValue,
        });
      });
      return;
    }

    // Still active — re-queue the next top-off. This is the chain that keeps
    // an indefinite series running forever: each top-off enqueues the next.
    await this.prisma.outboxEvent.create({
      data: {
        salonId,
        eventType: EventType.APPOINTMENT_SERIES_TOP_OFF_DUE,
        payload: { seriesId, salonId } as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
        nextAttemptAt: new Date(Date.now() + TOP_OFF_INTERVAL_MS),
      },
    });
  }
}
