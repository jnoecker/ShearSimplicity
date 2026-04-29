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
