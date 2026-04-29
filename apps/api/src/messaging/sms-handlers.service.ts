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
import {
  firstName,
  formatCancelSms,
  formatConfirmationSms,
  formatReminderSms,
  formatRescheduleSms,
} from "./sms-formatter";

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

type LoadedAppointment = NonNullable<
  Awaited<ReturnType<PrismaService["appointment"]["findFirst"]>>
> &
  Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

type SmsKind =
  | "appointment_confirmation"
  | "appointment_reschedule"
  | "appointment_cancellation"
  | "appointment_reminder";

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
    const ctx = await this.loadAppointmentContext(event);
    if (!ctx) return;

    // A reschedule between create and send means the customer should hear
    // about the *current* time — so reformat from current state every attempt.
    if (
      ctx.appointment.status === AppointmentStatus.CANCELLED ||
      ctx.appointment.status === AppointmentStatus.NO_SHOW
    ) {
      this.logger.log(
        `appointment.created skipped: appointment ${ctx.appointment.id} is ${ctx.appointment.status}`,
      );
      return;
    }

    const totalDuration = ctx.appointment.services.reduce(
      (acc, s) => acc + s.durationSnapshotMinutes,
      0,
    );
    const body = formatConfirmationSms({
      startAt: ctx.appointment.startAt,
      staffFirstName: firstName(ctx.appointment.staffMember.displayName),
      clientFirstName: firstName(ctx.appointment.client?.displayName ?? "there"),
      serviceNames: ctx.appointment.services.map((s) => s.serviceNameSnapshot),
      durationMinutes: totalDuration,
      salonName: ctx.salonName,
      salonTimezone: ctx.salonTimezone,
    });

    await this.sendOutboundSms({
      event,
      ctx,
      body,
      kind: "appointment_confirmation",
    });
  }

  async handleAppointmentRescheduled(event: OutboxRow): Promise<void> {
    const payload = (event.payload ?? {}) as { previousStartAt?: string };
    if (!payload.previousStartAt) {
      this.logger.warn(
        `appointment.rescheduled event ${event.id} missing previousStartAt — skipping`,
      );
      return;
    }
    const previousStartAt = new Date(payload.previousStartAt);
    if (Number.isNaN(previousStartAt.getTime())) {
      this.logger.warn(
        `appointment.rescheduled event ${event.id} has invalid previousStartAt — skipping`,
      );
      return;
    }

    const ctx = await this.loadAppointmentContext(event);
    if (!ctx) return;

    // Cancellations after a reschedule supersede the reschedule notice. Don't
    // tell the client about a move that no longer matters.
    if (
      ctx.appointment.status === AppointmentStatus.CANCELLED ||
      ctx.appointment.status === AppointmentStatus.NO_SHOW
    ) {
      this.logger.log(
        `appointment.rescheduled skipped: appointment ${ctx.appointment.id} is ${ctx.appointment.status}`,
      );
      return;
    }

    const body = formatRescheduleSms({
      previousStartAt,
      newStartAt: ctx.appointment.startAt,
      staffFirstName: firstName(ctx.appointment.staffMember.displayName),
      clientFirstName: firstName(ctx.appointment.client?.displayName ?? "there"),
      salonName: ctx.salonName,
      salonTimezone: ctx.salonTimezone,
    });

    await this.sendOutboundSms({
      event,
      ctx,
      body,
      kind: "appointment_reschedule",
    });
  }

  async handleAppointmentCancelled(event: OutboxRow): Promise<void> {
    const ctx = await this.loadAppointmentContext(event);
    if (!ctx) return;

    // Don't filter on status here — a cancellation SMS for a CANCELLED
    // appointment is the whole point.
    const body = formatCancelSms({
      startAt: ctx.appointment.startAt,
      staffFirstName: firstName(ctx.appointment.staffMember.displayName),
      clientFirstName: firstName(ctx.appointment.client?.displayName ?? "there"),
      salonName: ctx.salonName,
      salonTimezone: ctx.salonTimezone,
    });

    await this.sendOutboundSms({
      event,
      ctx,
      body,
      kind: "appointment_cancellation",
    });
  }

  async handleAppointmentReminderDue(event: OutboxRow): Promise<void> {
    const ctx = await this.loadAppointmentContext(event);
    if (!ctx) return;

    // Cancellation suppression already happens at scheduling time
    // (cancel() marks the reminder row COMPLETED in the same transaction).
    // The status checks here are belt + suspenders for races and for any
    // path that bypasses the suppression — e.g., a status transition to
    // COMPLETED / NO_SHOW between scheduling and firing.
    if (
      ctx.appointment.status === AppointmentStatus.CANCELLED ||
      ctx.appointment.status === AppointmentStatus.NO_SHOW ||
      ctx.appointment.status === AppointmentStatus.COMPLETED
    ) {
      this.logger.log(
        `appointment.reminder_due skipped: appointment ${ctx.appointment.id} is ${ctx.appointment.status}`,
      );
      return;
    }
    // A reminder for a time that's already past is just noise. Drop without
    // sending; the worker still marks the row COMPLETED so it stops polling.
    if (ctx.appointment.startAt.getTime() <= Date.now()) {
      this.logger.log(
        `appointment.reminder_due skipped: appointment ${ctx.appointment.id} startAt is in the past`,
      );
      return;
    }

    const body = formatReminderSms({
      startAt: ctx.appointment.startAt,
      staffFirstName: firstName(ctx.appointment.staffMember.displayName),
      clientFirstName: firstName(ctx.appointment.client?.displayName ?? "there"),
      salonName: ctx.salonName,
      salonTimezone: ctx.salonTimezone,
    });

    await this.sendOutboundSms({
      event,
      ctx,
      body,
      kind: "appointment_reminder",
    });
  }

  // ---------- shared helpers ----------

  private async loadAppointmentContext(event: OutboxRow): Promise<{
    appointment: LoadedAppointment;
    salonId: string;
    salonName: string;
    salonTimezone: string;
    toAddress: string;
  } | null> {
    const payload = (event.payload ?? {}) as { id?: string; salonId?: string };
    const appointmentId = payload.id;
    const salonId = payload.salonId;
    if (!appointmentId || !salonId) {
      this.logger.warn(
        `${event.eventType} event ${event.id} missing id/salonId in payload — skipping`,
      );
      return null;
    }

    const appointment = (await this.prisma.appointment.findFirst({
      where: { id: appointmentId, salonId },
      include: APPOINTMENT_INCLUDE,
    })) as LoadedAppointment | null;
    if (!appointment) {
      // The appointment was hard-deleted before we got here. We don't delete
      // appointments today — log loudly if this ever fires.
      this.logger.warn(
        `${event.eventType} event ${event.id} target appointment ${appointmentId} not found`,
      );
      return null;
    }

    const toAddress = appointment.client?.phone ?? null;
    if (!toAddress) {
      // No phone on file → no retry fixes that. Drop without throwing so the
      // outbox row completes.
      this.logger.log(
        `${event.eventType} skipped: client ${appointment.clientId} has no phone`,
      );
      return null;
    }

    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { name: true, timezone: true },
    });
    if (!salon) {
      this.logger.warn(
        `${event.eventType} skipped: salon ${salonId} not found`,
      );
      return null;
    }

    return {
      appointment,
      salonId,
      salonName: salon.name,
      salonTimezone: salon.timezone,
      toAddress,
    };
  }

  // INSERT-then-send-with-dedup, then transactional finalize. The bulk of
  // each handler reduces to "render a body and call this".
  private async sendOutboundSms({
    event,
    ctx,
    body,
    kind,
  }: {
    event: OutboxRow;
    ctx: {
      appointment: LoadedAppointment;
      salonId: string;
      toAddress: string;
    };
    body: string;
    kind: SmsKind;
  }): Promise<void> {
    const fromAddress = env.TWILIO_FROM_NUMBER ?? "+15555550100";

    let messageRowId: string;
    try {
      const created = await this.prisma.message.create({
        data: {
          salonId: ctx.salonId,
          clientId: ctx.appointment.clientId,
          channel: "SMS",
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
          toAddress: ctx.toAddress,
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
          this.logger.log(
            `${event.eventType} already sent on prior attempt (sid=${existing.providerMessageId})`,
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
        to: ctx.toAddress,
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
      throw sendErr;
    }

    // Pass the provider's status through verbatim — Twilio's create-time
    // response is often still QUEUED, and DELIVERED/FAILED only arrives
    // later via the status callback. Forcing SENT here would misrepresent
    // delivery progress.
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
          salonId: ctx.salonId,
          aggregateType: "MESSAGE",
          aggregateId: messageRowId,
          eventType: EventType.MESSAGE_SMS_SENT,
          payload: {
            appointmentId: ctx.appointment.id,
            providerMessageId: result.providerMessageId,
            to: ctx.toAddress,
            kind,
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
