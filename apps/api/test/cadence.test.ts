import { describe, expect, it } from "vitest";
import { occurrenceRange, occurrenceStartAt } from "../src/appointments/cadence";

describe("cadence", () => {
  it("produces equal-spaced occurrences within a single DST window", () => {
    // Anchor: 2026-04-15 4:45pm America/New_York (EDT, UTC-4 → 20:45Z).
    // EDT runs from March until November, so the next 5 monthly visits
    // never cross a DST boundary; arithmetic should be a clean +28 days.
    const anchorStartAt = new Date("2026-04-15T20:45:00.000Z");
    const occurrences = occurrenceRange({
      anchorStartAt,
      anchorIndex: 1,
      everyNWeeks: 4,
      startIndex: 1,
      count: 5,
      timeZone: "America/New_York",
    });
    expect(occurrences.map((o) => o.seriesIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(occurrences[0].startAt.toISOString()).toBe("2026-04-15T20:45:00.000Z");
    expect(occurrences[1].startAt.toISOString()).toBe("2026-05-13T20:45:00.000Z");
    expect(occurrences[2].startAt.toISOString()).toBe("2026-06-10T20:45:00.000Z");
    expect(occurrences[3].startAt.toISOString()).toBe("2026-07-08T20:45:00.000Z");
    expect(occurrences[4].startAt.toISOString()).toBe("2026-08-05T20:45:00.000Z");
  });

  it("preserves wall-clock time across the spring DST boundary", () => {
    // Anchor: 2026-02-12 4:45pm America/New_York (EST, UTC-5 → 21:45Z).
    // 4 weeks later is 2026-03-12 — which is past the 2026-03-08 DST
    // jump in the US, so the offset becomes UTC-4. The wall-clock time
    // should still be 4:45pm, meaning UTC shifts from 21:45Z to 20:45Z.
    const anchorStartAt = new Date("2026-02-12T21:45:00.000Z");
    const next = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 1,
      everyNWeeks: 4,
      seriesIndex: 2,
      timeZone: "America/New_York",
    });
    expect(next.toISOString()).toBe("2026-03-12T20:45:00.000Z");
  });

  it("preserves wall-clock time across the fall DST boundary", () => {
    // Anchor: 2026-10-15 4:45pm EDT (UTC-4 → 20:45Z). 4 weeks later is
    // 2026-11-12 — past the 2026-11-01 fallback to EST (UTC-5). The
    // wall-clock 4:45pm should map back to 21:45Z.
    const anchorStartAt = new Date("2026-10-15T20:45:00.000Z");
    const next = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 1,
      everyNWeeks: 4,
      seriesIndex: 2,
      timeZone: "America/New_York",
    });
    expect(next.toISOString()).toBe("2026-11-12T21:45:00.000Z");
  });

  it("anchorIndex shifts the formula's origin without changing cadence", () => {
    // After a "this and following" reschedule from occurrence #3, the
    // series anchor becomes the new time at index 3. Index 4 is one
    // cadence forward, index 5 is two.
    const anchorStartAt = new Date("2026-06-04T18:00:00.000Z");
    const week3 = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 3,
      everyNWeeks: 2,
      seriesIndex: 3,
      timeZone: "America/New_York",
    });
    const week4 = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 3,
      everyNWeeks: 2,
      seriesIndex: 4,
      timeZone: "America/New_York",
    });
    const week5 = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 3,
      everyNWeeks: 2,
      seriesIndex: 5,
      timeZone: "America/New_York",
    });
    expect(week3.toISOString()).toBe("2026-06-04T18:00:00.000Z");
    expect(week4.toISOString()).toBe("2026-06-18T18:00:00.000Z");
    expect(week5.toISOString()).toBe("2026-07-02T18:00:00.000Z");
  });

  it("supports a UTC-fixed timezone with no DST", () => {
    // Iceland is UTC year-round, so the cadence math is the trivial case.
    const anchorStartAt = new Date("2026-01-15T15:00:00.000Z");
    const next = occurrenceStartAt({
      anchorStartAt,
      anchorIndex: 1,
      everyNWeeks: 1,
      seriesIndex: 10,
      timeZone: "Atlantic/Reykjavik",
    });
    expect(next.toISOString()).toBe("2026-03-19T15:00:00.000Z");
  });
});
