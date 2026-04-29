import { z } from "zod";
import { AppointmentSource, AppointmentStatus, Role } from "./enums.js";

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
// Appointments (Phase 3a)
// ─────────────────────────────────────────────────────────────────────────────

// All times accepted from the client are ISO-8601 strings with offset (or Z).
// We coerce to Date here so downstream code is dealing in absolute instants —
// the salon timezone only matters for rendering, not storage.
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const optionalNotes = optionalTrimmed(4000);

export const appointmentSourceSchema = z.nativeEnum(AppointmentSource);
export const appointmentStatusSchema = z.nativeEnum(AppointmentStatus);

// At least one service is required: an appointment with zero services has no
// duration and the booking flow can't compute endAt.
export const appointmentCreateSchema = z.object({
  clientId: uuidSchema,
  staffMemberId: uuidSchema,
  serviceIds: z.array(uuidSchema).min(1).max(20),
  startAt: isoDateTime,
  notes: optionalNotes,
  internalNotes: optionalNotes,
  source: appointmentSourceSchema.default(AppointmentSource.STAFF),
});

// Reschedule cascade scope. "one" only moves this occurrence (default,
// matching the pre-recurrence behaviour). "following" shifts every future
// occurrence by the same delta and resets the series anchor so subsequent
// top-offs use the new pattern. Ignored on appointments without a seriesId.
export const appointmentScopeSchema = z.enum(["one", "following"]);

export const appointmentRescheduleSchema = z.object({
  startAt: isoDateTime,
  // Allow moving to a different stylist as part of a reschedule. When omitted,
  // the existing stylist is kept.
  staffMemberId: uuidSchema.optional(),
  scope: appointmentScopeSchema.default("one"),
});

export const appointmentCancelSchema = z.object({
  reason: optionalTrimmed(500),
  scope: appointmentScopeSchema.default("one"),
});

export const appointmentNotesUpdateSchema = z
  .object({
    notes: optionalNotes.optional(),
    internalNotes: optionalNotes.optional(),
  })
  .refine(
    (n) => n.notes !== undefined || n.internalNotes !== undefined,
    "Provide notes or internalNotes",
  );

// Status transitions outside reschedule/cancel/complete go through this
// endpoint. The state-machine guard lives in the service.
export const appointmentTransitionSchema = z.object({
  status: z.enum([
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.NO_SHOW,
  ]),
});

export const appointmentCompleteSchema = z.object({
  // When omitted, server uses now. Validation guarantees end > start when both
  // are provided.
  actualStartAt: isoDateTime.optional(),
  actualEndAt: isoDateTime.optional(),
});

export const appointmentListQuerySchema = z.object({
  // Day/week range queries use [from, to). Both required so we don't
  // accidentally scan the whole table.
  from: isoDateTime,
  to: isoDateTime,
  staffMemberId: uuidSchema.optional(),
  // CSV is awkward for arrays; comma-split for convenience. Each token is
  // validated against the enum so an unknown value surfaces as a 400 here
  // rather than a Prisma 500 later.
  status: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      const tokens = s.split(",").map((v) => v.trim()).filter(Boolean);
      const valid = new Set<string>(Object.values(AppointmentStatus));
      const bad = tokens.filter((t) => !valid.has(t));
      if (bad.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown appointment status: ${bad.join(", ")}`,
        });
        return z.NEVER;
      }
      return tokens as AppointmentStatus[];
    }),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentRescheduleInput = z.infer<
  typeof appointmentRescheduleSchema
>;
export type AppointmentCancelInput = z.infer<typeof appointmentCancelSchema>;
export type AppointmentNotesUpdateInput = z.infer<
  typeof appointmentNotesUpdateSchema
>;
export type AppointmentTransitionInput = z.infer<
  typeof appointmentTransitionSchema
>;
export type AppointmentCompleteInput = z.infer<
  typeof appointmentCompleteSchema
>;
export type AppointmentListQueryInput = z.infer<
  typeof appointmentListQuerySchema
>;
export type AppointmentScope = z.infer<typeof appointmentScopeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Recurring appointments (issue #19)
// ─────────────────────────────────────────────────────────────────────────────

// Cadence bounds. 1–52 weeks covers everything from "weekly highlights" to
// "yearly check-in"; the upper bound also caps the wall-clock arithmetic
// for the materializer. stopAfterVisits null is the indefinite mode (the
// regular long-term client). When set, 2–52 — a one-visit "series" makes
// no sense, and 52 is more than a year of weekly visits.
export const appointmentSeriesCreateSchema = z.object({
  clientId: uuidSchema,
  staffMemberId: uuidSchema,
  serviceIds: z.array(uuidSchema).min(1).max(20),
  // First occurrence's wall-clock start. The materializer treats this as
  // the series anchor: subsequent occurrences are at the same wall-clock
  // time, N weeks later, in the salon's timezone.
  startAt: isoDateTime,
  everyNWeeks: z.number().int().min(1).max(52),
  stopAfterVisits: z.number().int().min(2).max(52).nullable(),
  notes: optionalNotes,
  internalNotes: optionalNotes,
  source: appointmentSourceSchema.default(AppointmentSource.STAFF),
});

export const appointmentSeriesExtendSchema = z.object({
  // Add this many additional visits to a finite series. Server enforces
  // the resulting total stays within stopAfterVisits' max (52). For
  // indefinite series this endpoint is a no-op — they don't have a cap
  // to extend.
  additionalVisits: z.number().int().min(1).max(52),
});

export const appointmentSeriesCancelSchema = z.object({
  reason: optionalTrimmed(500),
});

export type AppointmentSeriesCreateInput = z.infer<
  typeof appointmentSeriesCreateSchema
>;
export type AppointmentSeriesExtendInput = z.infer<
  typeof appointmentSeriesExtendSchema
>;
export type AppointmentSeriesCancelInput = z.infer<
  typeof appointmentSeriesCancelSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Salon settings (Phase 2 surface — name, timezone. Business hours and
// branding land later.)
// ─────────────────────────────────────────────────────────────────────────────

// E.164 format: leading +, then 1–14 digits. Twilio enforces this on its
// side too; the shared schema rejects malformed values up front so the
// UI gets a meaningful error instead of a 4xx from the carrier.
const e164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{1,14}$/, "Must be in E.164 format, e.g. +15555550100");

export const salonSettingsUpdateSchema = z
  .object({
    name: trimmedString(120).optional(),
    timezone: timezoneSchema.optional(),
    // null = clear the salon's number; undefined = leave it alone.
    smsFromNumber: z.union([e164Schema, z.null()]).optional(),
  })
  .refine(
    (s) =>
      s.name !== undefined ||
      s.timezone !== undefined ||
      s.smsFromNumber !== undefined,
    "Provide at least one field to update",
  );

export type SalonSettingsUpdateInput = z.infer<
  typeof salonSettingsUpdateSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Payments (Phase 5a — Stripe Checkout via PaymentProvider).
// ─────────────────────────────────────────────────────────────────────────────

export const checkoutCreateSchema = z.object({
  appointmentId: z.string().uuid(),
  // Optional gratuity, in cents. Capped at $1000 so a typo or malicious
  // client can't blow up the customer's card; tips above this go through
  // a separate adjustment flow.
  tipCents: z.number().int().nonnegative().max(100_000).optional(),
  // Optional overrides for the Stripe-hosted-checkout return URLs. When
  // unset, the API generates routes on WEB_ORIGIN that the frontend
  // handles. Validated as URLs to avoid passing junk to Stripe.
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;

export const refundCreateSchema = z.object({
  // Omit for full refund. Capped to a generous appointment ceiling
  // ($10,000) so the validation can catch obvious typos before they hit
  // Stripe. Partial-refund UI lands later — schema is forward-compatible.
  amountCents: z.number().int().positive().max(1_000_000).optional(),
});
export type RefundCreateInput = z.infer<typeof refundCreateSchema>;
