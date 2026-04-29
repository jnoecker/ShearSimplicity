import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ActorType,
  AppointmentStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import { env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import {
  MESSAGING_PROVIDER,
  type MessagingProvider,
} from "./messaging-provider.interface";
import { firstName, formatConfirmationSms } from "./sms-formatter";

interface OutboxRow {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue;
}

const APPOINTMENT_INCLUDE = {
  client: { select: { id: true, displayName: true, phone: true } },
  staffMember: { select: { id: true, displayName: true } },
  services: {
    orderBy: [{ sortOrder: "asc" as const }],
    select: {
      serviceNameSnapshot: true,
      durationSnapshotMinutes: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

/**
 * Outbox event handlers for the messaging side. Wired into the worker's
 * dispatch table — the worker handles retry / dead-letter mechanics; this
 * just decides what to do per event type.
 *
 * Idempotency contract: every send writes a Message row keyed by
 * `outboxEventId`. A retry on the same event hits the unique constraint and
 * we re-fetch the existing row to decide whether the send actually went
 * through (`providerMessageId` present) or crashed mid-flight (it's not).
 */
@Injectable()
export class SmsHandlersService {
  private readonly logger = new Logger(SmsHandlersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGING_PROVIDER)
    private readonly messaging: MessagingProvider,
  ) {}

  async handleAppointmentCreated(event: OutboxRow): Promise<void> {
    // Pull the appointmentId out of the snapshot payload the writer stored
    // alongside the event (see appointments.service.ts → create()).
    const payload = (event.payload ?? {}) as { id?: string; salonId?: string };
    const appointmentId = payload.id;
    const salonId = payload.salonId;
    if (!appointmentId || !salonId) {
      this.logger.warn(
        `appointment.created event ${event.id} missing id/salonId in payload — skipping`,
      );
      return;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, salonId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      // The appointment was hard-deleted before we got here. Nothing to do —
      // but this shouldn't happen because we don't delete appointments. Log
      // so it's visible if it ever does.
      this.logger.warn(
        `appointment.created event ${event.id} target appointment ${appointmentId} not found`,
      );
      return;
    }
    // Re-formatting on every attempt means a reschedule between create and
    // send produces a confirmation for the *new* time, not the original one.
    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      this.logger.log(
        `appointment.created skipped: appointment ${appointmentId} is ${appointment.status}`,
      );
      return;
    }

    const toAddress = appointment.client?.phone ?? null;
    if (!toAddress) {
      // No phone on file → nothing we can send. Don't fail the outbox row;
      // there's no retry that fixes a missing phone.
      this.logger.log(
        `appointment.created skipped: client ${appointment.clientId} has no phone`,
      );
      return;
    }

    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { name: true, timezone: true },
    });
    if (!salon) {
      // Salon disappeared (which shouldn't happen — salons are not deleted).
      // Bail without retrying.
      this.logger.warn(
        `appointment.created skipped: salon ${salonId} not found`,
      );
      return;
    }

    const totalDuration = appointment.services.reduce(
      (acc, s) => acc + s.durationSnapshotMinutes,
      0,
    );
    const body = formatConfirmationSms({
      startAt: appointment.startAt,
      staffFirstName: firstName(appointment.staffMember.displayName),
      clientFirstName: firstName(appointment.client?.displayName ?? "there"),
      serviceNames: appointment.services.map((s) => s.serviceNameSnapshot),
      durationMinutes: totalDuration,
      salonName: salon.name,
      salonTimezone: salon.timezone,
    });

    const fromAddress = env.TWILIO_FROM_NUMBER ?? "+15555550100";

    // Idempotency front door: try to insert the Message row keyed by
    // outboxEventId. If a previous attempt crashed mid-send and left the
    // row in QUEUED with no providerMessageId, we'll re-call the provider
    // and update the same row instead of writing a new one.
    let messageRowId: string;
    try {
      const created = await this.prisma.message.create({
        data: {
          salonId,
          clientId: appointment.clientId,
          channel: "SMS",
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
          toAddress,
          fromAddress,
          body,
          outboxEventId: event.id,
        },
      });
      messageRowId = created.id;
    } catch (err) {
      if (isOutboxEventDedupConflict(err)) {
        const existing = await this.prisma.message.findUnique({
          where: { outboxEventId: event.id },
        });
        if (!existing) throw err;
        if (existing.providerMessageId) {
          // Already sent on a previous attempt that crashed before marking
          // the outbox row completed. The worker's idempotent finalize will
          // fix that — nothing else to do here.
          this.logger.log(
            `appointment.created already sent on prior attempt (sid=${existing.providerMessageId})`,
          );
          return;
        }
        messageRowId = existing.id;
      } else {
        throw err;
      }
    }

    let result;
    try {
      result = await this.messaging.sendSms({
        to: toAddress,
        from: fromAddress,
        body,
      });
    } catch (sendErr) {
      const message =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      await this.prisma.message.update({
        where: { id: messageRowId },
        data: {
          status: MessageStatus.FAILED,
          errorMessage: message.slice(0, 500),
        },
      });
      // Re-throw so the worker bumps `attempts` and retries — a transient
      // Twilio outage shouldn't terminally drop the SMS. The next attempt
      // will pick up the same Message row via outboxEventId.
      throw sendErr;
    }

    // Pass the provider's status through verbatim — Twilio's create-time
    // response is often still QUEUED/accepted, and the carrier-side terminal
    // state (DELIVERED / FAILED) only arrives later via a status callback.
    // Forcing SENT here would lie about delivery progress.
    const messageStatus: MessageStatus =
      result.status === "FAILED"
        ? MessageStatus.FAILED
        : result.status === "DELIVERED"
          ? MessageStatus.DELIVERED
          : result.status === "SENT"
            ? MessageStatus.SENT
            : MessageStatus.QUEUED;

    await this.prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: messageRowId },
        data: {
          status: messageStatus,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
      await tx.domainEvent.create({
        data: {
          salonId,
          aggregateType: "MESSAGE",
          aggregateId: messageRowId,
          eventType: EventType.MESSAGE_SMS_SENT,
          payload: {
            appointmentId,
            providerMessageId: result.providerMessageId,
            to: toAddress,
            kind: "appointment_confirmation",
          } satisfies Prisma.InputJsonValue,
          actorType: ActorType.SYSTEM,
        },
      });
    });
  }
}

// Prisma reports P2002's target inconsistently across drivers/versions: it
// can be the literal index name ("messages_outboxEventId_key") or the field
// list (["outboxEventId"]) or a single field name ("outboxEventId").
// Match all three so a real conflict can't slip through and rethrow into
// dead-letter.
function isOutboxEventDedupConflict(err: unknown): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return false;
  }
  const target = (err.meta as { target?: string | string[] } | undefined)
    ?.target;
  if (!target) return false;
  const matches = (s: string) =>
    s === "messages_outboxEventId_key" || s === "outboxEventId";
  return Array.isArray(target) ? target.some(matches) : matches(target);
}
