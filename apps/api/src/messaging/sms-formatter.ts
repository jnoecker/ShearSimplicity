interface AppointmentForSms {
  startAt: Date;
  staffFirstName: string;
  serviceNames: string[];
  durationMinutes: number;
  clientFirstName: string;
  salonName: string;
  salonTimezone: string;
}

/**
 * Templated confirmation SMS body. Kept short so it fits in one segment when
 * possible (160 GSM-7 chars). Includes a STOP instruction per A2P 10DLC
 * carrier requirements — the SMS terms doc at docs/sms-terms.md is the
 * canonical contract this body needs to honour.
 */
export function formatConfirmationSms(input: AppointmentForSms): string {
  const date = formatDateLabel(input.startAt, input.salonTimezone);
  const time = formatTimeLabel(input.startAt, input.salonTimezone);
  const services = input.serviceNames.join(", ");
  const dur = input.durationMinutes;
  return (
    `${input.salonName}: Hi ${input.clientFirstName}, you're booked ` +
    `${date} at ${time} with ${input.staffFirstName} (${services}, ${dur} min). ` +
    `Reply STOP to opt out.`
  );
}

interface RescheduleForSms {
  previousStartAt: Date;
  newStartAt: Date;
  staffFirstName: string;
  clientFirstName: string;
  salonName: string;
  salonTimezone: string;
}

export function formatRescheduleSms(input: RescheduleForSms): string {
  const fromLabel = formatDateTimeLabel(input.previousStartAt, input.salonTimezone);
  const toLabel = formatDateTimeLabel(input.newStartAt, input.salonTimezone);
  return (
    `${input.salonName}: Hi ${input.clientFirstName}, your appointment ` +
    `with ${input.staffFirstName} on ${fromLabel} has been moved to ${toLabel}. ` +
    `Reply STOP to opt out.`
  );
}

interface CancelForSms {
  startAt: Date;
  staffFirstName: string;
  clientFirstName: string;
  salonName: string;
  salonTimezone: string;
}

export function formatCancelSms(input: CancelForSms): string {
  const when = formatDateTimeLabel(input.startAt, input.salonTimezone);
  return (
    `${input.salonName}: Hi ${input.clientFirstName}, your appointment ` +
    `with ${input.staffFirstName} on ${when} has been cancelled. ` +
    `Reply STOP to opt out.`
  );
}

interface ReminderForSms {
  startAt: Date;
  staffFirstName: string;
  clientFirstName: string;
  salonName: string;
  salonTimezone: string;
}

export function formatReminderSms(input: ReminderForSms): string {
  const when = formatDateTimeLabel(input.startAt, input.salonTimezone);
  // Use a colon, not an em dash. Em dash is outside GSM-7 and forces the
  // whole message into UCS-2, dropping per-segment capacity from 160 → 70
  // chars. That was the only non-GSM-7 punctuation in any of our
  // production-bound templates; the other helpers stay ASCII.
  return (
    `${input.salonName}: Reminder: your appointment with ` +
    `${input.staffFirstName} is ${when}. Reply STOP to opt out.`
  );
}

function formatDateTimeLabel(instant: Date, timeZone: string): string {
  // "Thu Apr 30 at 1:00 PM" — combined so reschedule/cancel bodies stay
  // inside one segment with both before/after.
  return `${formatDateLabel(instant, timeZone)} at ${formatTimeLabel(
    instant,
    timeZone,
  )}`;
}

export function firstName(displayName: string): string {
  // The displayName is "First Last" / "First" / "First M. Last" — anything
  // before the first whitespace is the bit we'd address the client by.
  const trimmed = displayName.trim();
  if (!trimmed) return "there";
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

function formatDateLabel(instant: Date, timeZone: string): string {
  // "Wed Apr 30" — short to keep the body inside one SMS segment.
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

function formatTimeLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}
