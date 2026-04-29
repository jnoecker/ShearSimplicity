import { describe, expect, it } from "vitest";
import {
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
