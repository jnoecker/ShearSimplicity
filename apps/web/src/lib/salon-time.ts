import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";
import { addDays } from "date-fns";

// All appointment timestamps live as absolute UTC instants. The salon decides
// what day-boundary to draw — these helpers convert between "calendar date in
// the salon's wall clock" and the UTC instants we send to the API.
//
// DST note: a salon-local day can be 23, 24, or 25 UTC hours long. Every
// helper here works in salon wall-clock units rather than elapsed UTC minutes
// so the calendar grid (and the drop handler) stays correct on transition
// days.

export interface DayWindow {
  /** Inclusive UTC instant of midnight in the salon's timezone. */
  fromUtc: Date;
  /** Exclusive UTC instant of the next day's midnight in the salon's timezone. */
  toUtc: Date;
  /** "YYYY-MM-DD" in the salon's timezone — round-trip safe through the URL. */
  isoDate: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIsoInTimezone(timezone: string): string {
  return formatTz(new Date(), "yyyy-MM-dd", { timeZone: timezone });
}

export function dayWindow(isoDate: string, timezone: string): DayWindow {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  }
  // toUtc is *next* salon-local midnight, not fromUtc + 24h. On a
  // spring-forward day toUtc is 23h after fromUtc; on fall-back it's 25h.
  const fromUtc = fromZonedTime(`${isoDate}T00:00:00`, timezone);
  const nextIsoDate = shiftIsoDate(isoDate, 1, timezone);
  const toUtc = fromZonedTime(`${nextIsoDate}T00:00:00`, timezone);
  return { fromUtc, toUtc, isoDate };
}

/** Add N calendar days in the salon's timezone (handles DST). */
export function shiftIsoDate(
  isoDate: string,
  delta: number,
  timezone: string,
): string {
  // Anchor at midday so the +/- 24 UTC hours from addDays can't slip across
  // a DST gap and produce yesterday/tomorrow's date.
  const base = fromZonedTime(`${isoDate}T12:00:00`, timezone);
  const shifted = addDays(base, delta);
  return formatTz(shifted, "yyyy-MM-dd", { timeZone: timezone });
}

export function formatTimeInTimezone(date: Date, timezone: string): string {
  return formatTz(date, "h:mm a", { timeZone: timezone });
}

export function formatDayLabel(isoDate: string, timezone: string): string {
  // Anchor at midday so the label can't slip into the previous/next day at the
  // DST boundary while we format.
  const d = fromZonedTime(`${isoDate}T12:00:00`, timezone);
  return formatTz(d, "EEEE, MMMM d", { timeZone: timezone });
}

/**
 * Salon wall-clock minutes from midnight for a given UTC instant. We read the
 * instant's H:mm in the salon timezone and convert to minutes — that way a 9
 * AM appointment lands at slot 540 regardless of whether the day was 23, 24,
 * or 25 UTC hours long. `isoDate` is preserved in the signature so the
 * caller's grid context is explicit, even though the math no longer needs it.
 */
export function minutesFromDayStart(
  instant: Date,
  isoDate: string,
  timezone: string,
): number {
  void isoDate;
  const hm = formatTz(instant, "HH:mm", { timeZone: timezone });
  const [hh, mm] = hm.split(":").map(Number);
  return hh * 60 + mm;
}

/** Inverse of minutesFromDayStart — used by the drop handler. */
export function instantAtMinutes(
  minutes: number,
  isoDate: string,
  timezone: string,
): Date {
  // Build the salon-local wall-clock string and convert. fromZonedTime picks
  // the correct UTC offset for the date, so HH:mm round-trips through DST
  // gaps without drifting an hour.
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return fromZonedTime(`${isoDate}T${hh}:${mm}:00`, timezone);
}

/** Local-clock label for a UTC instant rendered in the salon's timezone. */
export { toZonedTime };
