import { describe, expect, it } from "vitest";
import {
  appointmentCreateSchema,
  appointmentListQuerySchema,
  appointmentTransitionSchema,
  clientCreateSchema,
  clientUpdateSchema,
  salonSettingsUpdateSchema,
  serviceCategoryCreateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  staffCreateSchema,
  workingHoursReplaceSchema,
} from "../src/schemas.js";

describe("staffCreateSchema", () => {
  it("trims displayName and applies isActive default", () => {
    const parsed = staffCreateSchema.parse({ displayName: "  Maya  " });
    expect(parsed.displayName).toBe("Maya");
    expect(parsed.isActive).toBe(true);
    expect(parsed.title).toBeNull();
  });

  it("rejects an empty displayName after trim", () => {
    expect(() => staffCreateSchema.parse({ displayName: "   " })).toThrow();
  });

  it("rejects a non-hex color", () => {
    expect(() =>
      staffCreateSchema.parse({ displayName: "Maya", color: "blue" }),
    ).toThrow();
  });

  it("accepts a valid 6-digit hex color", () => {
    const parsed = staffCreateSchema.parse({
      displayName: "Maya",
      color: "#a1b2c3",
    });
    expect(parsed.color).toBe("#a1b2c3");
  });
});

describe("workingHoursReplaceSchema", () => {
  it("rejects a window with end at or before start", () => {
    expect(() =>
      workingHoursReplaceSchema.parse({
        windows: [
          {
            dayOfWeek: 1,
            startMinutesFromMidnight: 600,
            endMinutesFromMidnight: 600,
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts an empty replacement (closes the calendar)", () => {
    expect(workingHoursReplaceSchema.parse({ windows: [] })).toEqual({
      windows: [],
    });
  });
});

describe("serviceCreateSchema", () => {
  it("normalizes slug and currency", () => {
    const parsed = serviceCreateSchema.parse({
      name: "Balayage",
      slug: "  Balayage-Premium  ",
      defaultDurationMinutes: 180,
      defaultPriceCents: 18000,
      currency: "usd",
    });
    expect(parsed.slug).toBe("balayage-premium");
    expect(parsed.currency).toBe("USD");
  });

  it("rejects slug with whitespace or symbols", () => {
    expect(() =>
      serviceCreateSchema.parse({
        name: "Cut",
        slug: "men's cut",
        defaultDurationMinutes: 30,
        defaultPriceCents: 4500,
      }),
    ).toThrow();
  });

  it("rejects out-of-range duration", () => {
    expect(() =>
      serviceCreateSchema.parse({
        name: "Cut",
        slug: "cut",
        defaultDurationMinutes: 0,
        defaultPriceCents: 4500,
      }),
    ).toThrow();
  });
});

describe("serviceUpdateSchema", () => {
  it("accepts a partial update", () => {
    const parsed = serviceUpdateSchema.parse({ defaultPriceCents: 5500 });
    expect(parsed.defaultPriceCents).toBe(5500);
    expect(parsed.name).toBeUndefined();
  });
});

describe("serviceCategoryCreateSchema", () => {
  it("defaults sortOrder to 0", () => {
    expect(serviceCategoryCreateSchema.parse({ name: "Color" })).toEqual({
      name: "Color",
      sortOrder: 0,
    });
  });
});

describe("clientCreateSchema", () => {
  it("derives displayName from first/last when omitted", () => {
    const parsed = clientCreateSchema.parse({
      firstName: "Sam",
      lastName: "Lee",
    });
    expect(parsed.displayName).toBe("Sam Lee");
  });

  it("preserves an explicit displayName", () => {
    const parsed = clientCreateSchema.parse({
      firstName: "Sam",
      displayName: "Sammy",
    });
    expect(parsed.displayName).toBe("Sammy");
  });

  it("lowercases email and treats blank phone as null", () => {
    const parsed = clientCreateSchema.parse({
      firstName: "Sam",
      email: "  Sam@Example.COM ",
      phone: "   ",
    });
    expect(parsed.email).toBe("sam@example.com");
    expect(parsed.phone).toBeNull();
  });

  it("rejects a phone with no digits", () => {
    expect(() =>
      clientCreateSchema.parse({ firstName: "Sam", phone: "----" }),
    ).toThrow();
  });
});

describe("clientUpdateSchema", () => {
  it("accepts an empty update (no-op)", () => {
    expect(clientUpdateSchema.parse({})).toEqual({});
  });

  it("collapses blank optional fields to null so updates can clear them", () => {
    const parsed = clientUpdateSchema.parse({
      lastName: "",
      email: "",
      phone: "",
      notes: "",
    });
    expect(parsed.lastName).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });
});

describe("salonSettingsUpdateSchema", () => {
  it("accepts a known IANA timezone", () => {
    expect(
      salonSettingsUpdateSchema.parse({ timezone: "America/Los_Angeles" }),
    ).toEqual({ timezone: "America/Los_Angeles" });
  });

  it("rejects an unknown timezone", () => {
    expect(() =>
      salonSettingsUpdateSchema.parse({ timezone: "Mars/Olympus_Mons" }),
    ).toThrow();
  });

  it("rejects an empty payload", () => {
    expect(() => salonSettingsUpdateSchema.parse({})).toThrow();
  });
});

describe("appointmentCreateSchema", () => {
  const validInput = {
    clientId: "11111111-1111-1111-1111-111111111111",
    staffMemberId: "22222222-2222-2222-2222-222222222222",
    serviceIds: ["33333333-3333-3333-3333-333333333333"],
    startAt: "2026-05-01T14:00:00Z",
  };

  it("coerces startAt to a Date and applies default source", () => {
    const parsed = appointmentCreateSchema.parse(validInput);
    expect(parsed.startAt).toBeInstanceOf(Date);
    expect(parsed.startAt.toISOString()).toBe("2026-05-01T14:00:00.000Z");
    expect(parsed.source).toBe("STAFF");
  });

  it("requires at least one service", () => {
    expect(() =>
      appointmentCreateSchema.parse({ ...validInput, serviceIds: [] }),
    ).toThrow();
  });

  it("rejects a startAt without offset/Z", () => {
    expect(() =>
      appointmentCreateSchema.parse({
        ...validInput,
        startAt: "2026-05-01T14:00:00",
      }),
    ).toThrow();
  });
});

describe("appointmentTransitionSchema", () => {
  it("accepts the four manually-driven targets", () => {
    for (const status of ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "NO_SHOW"]) {
      expect(appointmentTransitionSchema.parse({ status }).status).toBe(status);
    }
  });

  it("rejects targets that have dedicated endpoints", () => {
    // CANCELLED, COMPLETED, and SCHEDULED each go through their own routes
    // (cancel, complete, create) — letting them through here would bypass the
    // input that those endpoints require.
    for (const status of ["CANCELLED", "COMPLETED", "SCHEDULED"]) {
      expect(() => appointmentTransitionSchema.parse({ status })).toThrow();
    }
  });
});

describe("appointmentListQuerySchema", () => {
  it("splits comma-separated status into an array", () => {
    const parsed = appointmentListQuerySchema.parse({
      from: "2026-05-01T00:00:00Z",
      to: "2026-05-02T00:00:00Z",
      status: "SCHEDULED,CONFIRMED",
    });
    expect(parsed.status).toEqual(["SCHEDULED", "CONFIRMED"]);
  });

  it("returns undefined status when omitted", () => {
    const parsed = appointmentListQuerySchema.parse({
      from: "2026-05-01T00:00:00Z",
      to: "2026-05-02T00:00:00Z",
    });
    expect(parsed.status).toBeUndefined();
  });

  it("rejects unknown status tokens with a 400-shaped error", () => {
    expect(() =>
      appointmentListQuerySchema.parse({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-02T00:00:00Z",
        status: "SCHEDULED,BOGUS",
      }),
    ).toThrow(/Unknown appointment status: BOGUS/);
  });
});
