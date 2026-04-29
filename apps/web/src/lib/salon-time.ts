import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";
import { addDays } from "date-fns";

// All appointment timestamps live as absolute UTC instants. The salon decides
// what day-boundary to draw — these helpers convert between "calendar date in
// the salon's wall clock" and the UTC instants we send to the API.

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
  // fromZonedTime("2026-04-29T00:00:00", "America/New_York") yields the UTC
  // instant when New York's wall clock reads midnight on the 29th — i.e. the
  // start of that calendar day.
  const fromUtc = fromZonedTime(`${isoDate}T00:00:00`, timezone);
  const toUtc = fromZonedTime(`${isoDate}T00:00:00`, timezone);
  toUtc.setTime(addDays(toUtc, 1).getTime());
  return { fromUtc, toUtc, isoDate };
}

/** Add N calendar days in the salon's timezone (handles DST). */
export function shiftIsoDate(
  isoDate: string,
  delta: number,
  timezone: string,
): string {
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

/** Minutes from the start of the salon-local day for a given UTC instant. */
export function minutesFromDayStart(
  instant: Date,
  isoDate: string,
  timezone: string,
): number {
  const dayStart = dayWindow(isoDate, timezone).fromUtc;
  return Math.round((instant.getTime() - dayStart.getTime()) / 60_000);
}

/** Inverse of minutesFromDayStart — used by the drop handler. */
export function instantAtMinutes(
  minutes: number,
  isoDate: string,
  timezone: string,
): Date {
  const dayStart = dayWindow(isoDate, timezone).fromUtc;
  return new Date(dayStart.getTime() + minutes * 60_000);
}

/** Local-clock label for a UTC instant rendered in the salon's timezone. */
export { toZonedTime };
