// Wall-clock-preserving cadence math for AppointmentSeries.
//
// "Every 4 weeks at 4:45pm Thursday" must mean 4:45pm wall-clock — not
// "exactly 28 * 24h after the previous occurrence", which would drift by
// an hour twice a year as the salon's timezone enters and exits DST.
//
// Pattern: pull the local components of the anchor in salon.timezone, add
// (n * everyNWeeks * 7) calendar days, then convert that local datetime
// back to UTC at the target date's offset. The offset lookup uses
// Intl.DateTimeFormat which knows the IANA tz database — no extra deps.

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const LOCAL_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = LOCAL_PARTS_FORMATTER_CACHE.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    LOCAL_PARTS_FORMATTER_CACHE.set(timeZone, f);
  }
  return f;
}

function localPartsAt(instant: Date, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    // Intl reports 24 for midnight in some locales; normalise to 0.
    hour: Number(m.hour) === 24 ? 0 : Number(m.hour),
    minute: Number(m.minute),
    second: Number(m.second),
  };
}

// Convert a wall-clock datetime in `timeZone` to the corresponding UTC
// instant. Uses one fixed-point refinement: a first guess based on UTC
// arithmetic, then we ask "what does that instant look like in tz?",
// extract the offset, and shift. One refinement is enough because the
// offset only depends on the date once you're within an hour of the target.
function utcFromLocal(parts: LocalParts, timeZone: string): Date {
  const guessUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const guessLocal = localPartsAt(new Date(guessUtcMs), timeZone);
  const guessLocalAsUtcMs = Date.UTC(
    guessLocal.year,
    guessLocal.month - 1,
    guessLocal.day,
    guessLocal.hour,
    guessLocal.minute,
    guessLocal.second,
  );
  const offsetMs = guessLocalAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

// Compute the start time of occurrence #seriesIndex given the series anchor.
// anchorIndex is the seriesIndex assigned to anchorStartAt — usually 1, but
// shifted forward when the user reschedules "this and following".
export function occurrenceStartAt(args: {
  anchorStartAt: Date;
  anchorIndex: number;
  everyNWeeks: number;
  seriesIndex: number;
  timeZone: string;
}): Date {
  const offsetWeeks = (args.seriesIndex - args.anchorIndex) * args.everyNWeeks;
  if (offsetWeeks === 0) return args.anchorStartAt;
  const local = localPartsAt(args.anchorStartAt, args.timeZone);
  // 7 calendar days × week-count, applied to the day field. Date.UTC
  // handles month / year overflow cleanly.
  const shifted: LocalParts = { ...local, day: local.day + offsetWeeks * 7 };
  return utcFromLocal(shifted, args.timeZone);
}

// Convenience for the materializer: list the (seriesIndex, startAt) pairs
// for `count` consecutive occurrences starting at startIndex.
export function occurrenceRange(args: {
  anchorStartAt: Date;
  anchorIndex: number;
  everyNWeeks: number;
  startIndex: number;
  count: number;
  timeZone: string;
}): { seriesIndex: number; startAt: Date }[] {
  const out: { seriesIndex: number; startAt: Date }[] = [];
  for (let i = 0; i < args.count; i++) {
    const seriesIndex = args.startIndex + i;
    out.push({
      seriesIndex,
      startAt: occurrenceStartAt({
        anchorStartAt: args.anchorStartAt,
        anchorIndex: args.anchorIndex,
        everyNWeeks: args.everyNWeeks,
        seriesIndex,
        timeZone: args.timeZone,
      }),
    });
  }
  return out;
}
