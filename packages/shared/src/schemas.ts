import { z } from "zod";
import { Role } from "./enums.js";

// Field-level building blocks — reused across create/update shapes so the
// same trim/length/format rules apply everywhere.

const trimmedString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Required").max(max));

const optionalTrimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max))
    .optional()
    .transform((s) => (s === undefined || s === "" ? null : s))
    .nullable();

// 7-char hex color including the leading "#". Frontend renders these as
// stylist column tints; we don't need full CSS color support.
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB hex color")
  .optional()
  .nullable();

// Phone numbers stored as the user typed them (we display, not dial).
// Validation only enforces an upper bound and that there's at least one digit.
const phoneSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .max(32)
      .refine((s) => s === "" || /\d/.test(s), "Phone must contain digits"),
  )
  .optional()
  .transform((s) => (s === undefined || s === "" ? null : s))
  .nullable();

// Empty strings come from cleared form fields and must round-trip to null on
// update so the user can actually remove a saved address. Preprocess collapses
// blank/undefined to null up front so the inner email validator never sees an
// empty string (which it would otherwise reject as malformed).
const emailSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v ?? null;
    const t = v.trim().toLowerCase();
    return t === "" ? null : t;
  },
  z.string().email().max(254).nullable(),
);

const slugSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, and dashes"),
  );

const uuidSchema = z.string().uuid();

// IANA tz database identifiers are too varied to validate by regex; we lean on
// Intl.DateTimeFormat at runtime instead. The schema keeps a sane upper bound
// so a malformed value still fails fast.
const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => isValidTimezone(tz), "Unknown IANA timezone");

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff
// ─────────────────────────────────────────────────────────────────────────────

export const staffCreateSchema = z.object({
  displayName: trimmedString(120),
  title: optionalTrimmed(80),
  color: hexColor,
  bio: optionalTrimmed(2000),
  isActive: z.boolean().default(true),
  userId: uuidSchema.optional().nullable(),
});

export const staffUpdateSchema = staffCreateSchema.partial();

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

// Working hours editor receives the full set per stylist as a replacement
// (simpler than diffing rows). Each row is a single weekday window in the
// salon's local time, expressed as minutes from midnight.
export const workingHoursWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinutesFromMidnight: z.number().int().min(0).max(24 * 60),
    endMinutesFromMidnight: z.number().int().min(0).max(24 * 60),
  })
  .refine(
    (w) => w.endMinutesFromMidnight > w.startMinutesFromMidnight,
    "End must be after start",
  );

export const workingHoursReplaceSchema = z.object({
  windows: z.array(workingHoursWindowSchema).max(50),
});

export type WorkingHoursWindow = z.infer<typeof workingHoursWindowSchema>;
export type WorkingHoursReplaceInput = z.infer<
  typeof workingHoursReplaceSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Salon membership (used by staff page when linking a stylist to a user)
// ─────────────────────────────────────────────────────────────────────────────

export const roleSchema = z.nativeEnum(Role);

// ─────────────────────────────────────────────────────────────────────────────
// Services + categories
// ─────────────────────────────────────────────────────────────────────────────

export const serviceCategoryCreateSchema = z.object({
  name: trimmedString(80),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const serviceCategoryUpdateSchema = serviceCategoryCreateSchema.partial();

export type ServiceCategoryCreateInput = z.infer<
  typeof serviceCategoryCreateSchema
>;
export type ServiceCategoryUpdateInput = z.infer<
  typeof serviceCategoryUpdateSchema
>;

// Prices are integer cents to keep arithmetic exact. 24h × 60 min upper bound
// on duration so a typo can't produce a year-long appointment block.
export const serviceCreateSchema = z.object({
  name: trimmedString(120),
  slug: slugSchema,
  categoryId: uuidSchema.optional().nullable(),
  description: optionalTrimmed(2000),
  defaultDurationMinutes: z.number().int().min(5).max(24 * 60),
  defaultPriceCents: z.number().int().min(0).max(10_000_000),
  currency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase())
    .default("USD"),
  isActive: z.boolean().default(true),
});

export const serviceUpdateSchema = serviceCreateSchema.partial();

export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export const clientCreateSchema = z
  .object({
    firstName: trimmedString(80),
    lastName: optionalTrimmed(80),
    displayName: optionalTrimmed(160),
    email: emailSchema,
    phone: phoneSchema,
    notes: optionalTrimmed(4000),
  })
  .transform((c) => ({
    ...c,
    // Default displayName to "First Last" so list views always have a label,
    // without forcing the form to compute it client-side.
    displayName:
      c.displayName ??
      [c.firstName, c.lastName].filter((p): p is string => Boolean(p)).join(" "),
  }));

export const clientUpdateSchema = z.object({
  firstName: trimmedString(80).optional(),
  lastName: optionalTrimmed(80).optional(),
  // displayName is non-null in the model — allow editing the value but not
  // clearing it. Use clientCreateSchema's derivation if you want the auto
  // "First Last" fallback.
  displayName: trimmedString(160).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  notes: optionalTrimmed(4000).optional(),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Salon settings (Phase 2 surface — name, timezone. Business hours and
// branding land later.)
// ─────────────────────────────────────────────────────────────────────────────

export const salonSettingsUpdateSchema = z
  .object({
    name: trimmedString(120).optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine(
    (s) => s.name !== undefined || s.timezone !== undefined,
    "Provide at least one field to update",
  );

export type SalonSettingsUpdateInput = z.infer<
  typeof salonSettingsUpdateSchema
>;
