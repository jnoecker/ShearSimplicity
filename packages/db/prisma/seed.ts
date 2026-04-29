// Seeds the dev fixture that DevAuthProvider returns, plus a realistic day
// of staff, services, clients, and appointments so the calendar has
// something to render out of the box.
//
// Idempotent for the foundation rows (user / salon / membership / staff /
// categories / services / clients) — re-running upserts in place. The
// appointments block is destructive for the dev salon: every run clears
// today's existing appointments (and their event rows) and inserts a fresh
// realistic schedule anchored at the current date in the salon's timezone.

import {
  ActorType,
  AppointmentSource,
  AppointmentStatus,
  MembershipStatus,
  PrismaClient,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();

const SALON_TZ = "America/New_York";

interface StaffSeed {
  slug: string;
  displayName: string;
  title: string;
  color: string;
}
const STAFF_SEEDS: StaffSeed[] = [
  { slug: "trina", displayName: "Trina Bellweather", title: "Owner · Master stylist", color: "#1ec3d9" },
  { slug: "rae", displayName: "Rae Okonkwo", title: "Color specialist", color: "#0892a8" },
  { slug: "felix", displayName: "Felix Marin", title: "Barber", color: "#4a82b3" },
  { slug: "nia", displayName: "Nia Espinoza", title: "Junior stylist", color: "#5cdcec" },
];

interface CategorySeed {
  name: string;
  sortOrder: number;
  services: ServiceSeed[];
}
interface ServiceSeed {
  slug: string;
  name: string;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
}
const CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: "Color",
    sortOrder: 0,
    services: [
      { slug: "color-cut", name: "Color & Cut", defaultDurationMinutes: 120, defaultPriceCents: 18500 },
      { slug: "balayage", name: "Balayage", defaultDurationMinutes: 180, defaultPriceCents: 28000 },
      { slug: "color-refresh", name: "Color refresh", defaultDurationMinutes: 90, defaultPriceCents: 14000 },
      { slug: "toner-refresh", name: "Toner refresh", defaultDurationMinutes: 45, defaultPriceCents: 6500 },
    ],
  },
  {
    name: "Cut & Style",
    sortOrder: 1,
    services: [
      { slug: "womens-cut", name: "Women's cut", defaultDurationMinutes: 60, defaultPriceCents: 9500 },
      { slug: "mens-cut", name: "Men's cut", defaultDurationMinutes: 45, defaultPriceCents: 5500 },
      { slug: "trim", name: "Trim", defaultDurationMinutes: 30, defaultPriceCents: 3500 },
      { slug: "beard-trim", name: "Beard trim", defaultDurationMinutes: 30, defaultPriceCents: 2500 },
      { slug: "blowout", name: "Blowout", defaultDurationMinutes: 60, defaultPriceCents: 6500 },
      { slug: "bridal-updo", name: "Bridal Updo", defaultDurationMinutes: 90, defaultPriceCents: 18000 },
    ],
  },
];

interface ClientSeed {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes?: string;
}
const CLIENT_SEEDS: ClientSeed[] = [
  { firstName: "Mira",     lastName: "Castellanos", phone: "(415) 555-0192", email: "mira@example.com", notes: "Balayage, no parabens" },
  { firstName: "Jules",    lastName: "Pham",        phone: "(415) 555-0144", email: "jules@example.com", notes: "Loves Rae" },
  { firstName: "Aiyana",   lastName: "Brooks",      phone: "(415) 555-0288", email: "aiyana@example.com", notes: "Bridal — Aug 12" },
  { firstName: "Saoirse",  lastName: "Lin",         phone: "(415) 555-0167", email: "saoirse@example.com", notes: "Sensitive scalp" },
  { firstName: "Cosmo",    lastName: "Reyes",       phone: "(415) 555-0203", email: "cosmo@example.com", notes: "Quiet appointments" },
  { firstName: "Devon",    lastName: "Ashworth",    phone: "(415) 555-0341", email: "devon@example.com", notes: "Cool tones only" },
  { firstName: "Imani",    lastName: "Calderón",    phone: "(415) 555-0119", email: "imani@example.com", notes: "Standing 1st-Friday" },
  { firstName: "Theo",     lastName: "Nakamura",    phone: "(415) 555-0476", email: "theo@example.com" },
  { firstName: "Priya",    lastName: "Mehta",       phone: "(415) 555-0388", email: "priya@example.com" },
  { firstName: "Aja",      lastName: "Hartley",     phone: "(415) 555-0512", email: "aja@example.com" },
];

// Each row plants one appointment on today: stylist slug, client first name,
// list of service slugs, salon-local start hour:minute, status. Times are
// expressed in the salon's local clock so the seeded day looks the same in
// any timezone tsx happens to run in.
interface ApptSeed {
  staff: string;
  client: string;
  services: string[];
  startHour: number;
  startMinute: number;
  status: AppointmentStatus;
}
const APPT_SEEDS: ApptSeed[] = [
  { staff: "trina", client: "Mira",    services: ["color-cut"],     startHour: 9,  startMinute: 0,  status: AppointmentStatus.IN_PROGRESS },
  { staff: "trina", client: "Aiyana",  services: ["bridal-updo"],   startHour: 12, startMinute: 30, status: AppointmentStatus.CONFIRMED },
  { staff: "trina", client: "Devon",   services: ["color-cut"],     startHour: 16, startMinute: 0,  status: AppointmentStatus.SCHEDULED },

  { staff: "rae",   client: "Jules",   services: ["balayage"],      startHour: 11, startMinute: 0,  status: AppointmentStatus.CONFIRMED },
  { staff: "rae",   client: "Saoirse", services: ["toner-refresh"], startHour: 14, startMinute: 30, status: AppointmentStatus.SCHEDULED },

  { staff: "felix", client: "Theo",    services: ["mens-cut"],      startHour: 10, startMinute: 0,  status: AppointmentStatus.CHECKED_IN },
  { staff: "felix", client: "Cosmo",   services: ["mens-cut", "beard-trim"], startHour: 13, startMinute: 30, status: AppointmentStatus.SCHEDULED },
  { staff: "felix", client: "Aja",     services: ["blowout"],       startHour: 16, startMinute: 0,  status: AppointmentStatus.SCHEDULED },

  { staff: "nia",   client: "Imani",   services: ["color-refresh"], startHour: 10, startMinute: 0,  status: AppointmentStatus.CONFIRMED },
  { staff: "nia",   client: "Priya",   services: ["womens-cut"],    startHour: 13, startMinute: 0,  status: AppointmentStatus.SCHEDULED },
];

async function main(): Promise<void> {
  const userId = required("DEV_USER_ID");
  const userEmail = required("DEV_USER_EMAIL");
  const salonId = required("DEV_SALON_ID");
  const salonSlug = required("DEV_SALON_SLUG");

  const user = await prisma.user.upsert({
    where: { id: userId },
    update: { email: userEmail, displayName: "Dev User" },
    create: { id: userId, email: userEmail, displayName: "Dev User" },
  });

  const salon = await prisma.salon.upsert({
    where: { id: salonId },
    update: { slug: salonSlug, name: "Acme Salon (dev)", timezone: SALON_TZ },
    create: {
      id: salonId,
      slug: salonSlug,
      name: "Acme Salon (dev)",
      timezone: SALON_TZ,
    },
  });

  await prisma.salonMembership.upsert({
    where: { salonId_userId: { salonId: salon.id, userId: user.id } },
    update: { role: Role.OWNER, status: MembershipStatus.ACTIVE },
    create: {
      salonId: salon.id,
      userId: user.id,
      role: Role.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  // ─── Staff (upsert by salon + displayName via two-step lookup since there's
  //     no natural composite unique on displayName).
  const staffBySlug = new Map<string, { id: string; salonId: string }>();
  for (const s of STAFF_SEEDS) {
    const existing = await prisma.staffMember.findFirst({
      where: { salonId: salon.id, displayName: s.displayName },
      select: { id: true, salonId: true },
    });
    if (existing) {
      await prisma.staffMember.update({
        where: { id: existing.id },
        data: { title: s.title, color: s.color, isActive: true },
      });
      staffBySlug.set(s.slug, existing);
    } else {
      const created = await prisma.staffMember.create({
        data: {
          salonId: salon.id,
          displayName: s.displayName,
          title: s.title,
          color: s.color,
          isActive: true,
        },
        select: { id: true, salonId: true },
      });
      staffBySlug.set(s.slug, created);
    }
  }

  // ─── Categories + services (upsert by salonId + name / slug).
  const serviceBySlug = new Map<
    string,
    {
      id: string;
      salonId: string;
      name: string;
      defaultDurationMinutes: number;
      defaultPriceCents: number;
      currency: string;
    }
  >();
  for (const cat of CATEGORY_SEEDS) {
    const category = await prisma.serviceCategory.upsert({
      where: { salonId_name: { salonId: salon.id, name: cat.name } },
      update: { sortOrder: cat.sortOrder },
      create: { salonId: salon.id, name: cat.name, sortOrder: cat.sortOrder },
    });
    for (const svc of cat.services) {
      const upserted = await prisma.service.upsert({
        where: { salonId_slug: { salonId: salon.id, slug: svc.slug } },
        update: {
          name: svc.name,
          categoryId: category.id,
          defaultDurationMinutes: svc.defaultDurationMinutes,
          defaultPriceCents: svc.defaultPriceCents,
          isActive: true,
        },
        create: {
          salonId: salon.id,
          categoryId: category.id,
          slug: svc.slug,
          name: svc.name,
          defaultDurationMinutes: svc.defaultDurationMinutes,
          defaultPriceCents: svc.defaultPriceCents,
          currency: "USD",
          isActive: true,
        },
        select: {
          id: true,
          salonId: true,
          name: true,
          defaultDurationMinutes: true,
          defaultPriceCents: true,
          currency: true,
        },
      });
      serviceBySlug.set(svc.slug, upserted);
    }
  }

  // ─── Clients (upsert by salonId + phone since that's what the schema
  //     uniques on).
  const clientByFirst = new Map<string, { id: string; salonId: string }>();
  for (const c of CLIENT_SEEDS) {
    const upserted = await prisma.client.upsert({
      where: { salonId_phone: { salonId: salon.id, phone: c.phone } },
      update: {
        firstName: c.firstName,
        lastName: c.lastName,
        displayName: `${c.firstName} ${c.lastName}`,
        email: c.email,
        notes: c.notes ?? null,
      },
      create: {
        salonId: salon.id,
        firstName: c.firstName,
        lastName: c.lastName,
        displayName: `${c.firstName} ${c.lastName}`,
        phone: c.phone,
        email: c.email,
        notes: c.notes ?? null,
      },
      select: { id: true, salonId: true },
    });
    clientByFirst.set(c.firstName, upserted);
  }

  // ─── Today's appointments — destructive: clear what's there and rebuild.
  //     Domain/outbox events for the cleared appointments stay in place
  //     (append-only contract); we just nuke the appointment + service-link
  //     rows so the calendar shows the fresh fixture.
  const { fromUtc, toUtc } = todayBoundsInTimezone(SALON_TZ);
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      salonId: salon.id,
      startAt: { gte: fromUtc, lt: toUtc },
    },
    select: { id: true },
  });
  if (existingAppointments.length > 0) {
    const ids = existingAppointments.map((a) => a.id);
    await prisma.appointmentService.deleteMany({
      where: { salonId: salon.id, appointmentId: { in: ids } },
    });
    await prisma.appointment.deleteMany({
      where: { salonId: salon.id, id: { in: ids } },
    });
  }

  for (const a of APPT_SEEDS) {
    const staff = staffBySlug.get(a.staff);
    const client = clientByFirst.get(a.client);
    if (!staff || !client) continue;

    const services = a.services
      .map((slug) => serviceBySlug.get(slug))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (services.length === 0) continue;

    const totalDuration = services.reduce(
      (acc, s) => acc + s.defaultDurationMinutes,
      0,
    );
    const startAt = utcInstantForLocalTime(a.startHour, a.startMinute, SALON_TZ);
    const endAt = new Date(startAt.getTime() + totalDuration * 60_000);

    const appointment = await prisma.appointment.create({
      data: {
        salonId: salon.id,
        clientId: client.id,
        staffMemberId: staff.id,
        startAt,
        endAt,
        status: a.status,
        source: AppointmentSource.STAFF,
        createdById: user.id,
        services: {
          // salonId is propagated from the parent appointment via the
          // composite FK — including it here errors at runtime.
          create: services.map((svc, i) => ({
            serviceId: svc.id,
            serviceNameSnapshot: svc.name,
            priceSnapshotCents: svc.defaultPriceCents,
            durationSnapshotMinutes: svc.defaultDurationMinutes,
            currencySnapshot: svc.currency,
            sortOrder: i,
          })),
        },
      },
    });
    await prisma.domainEvent.create({
      data: {
        salonId: salon.id,
        aggregateType: "APPOINTMENT",
        aggregateId: appointment.id,
        eventType: "appointment.created",
        payload: { seeded: true },
        actorType: ActorType.SYSTEM,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    [
      `Seeded dev fixture:`,
      `  user        ${user.id}`,
      `  salon       ${salon.id} (${salon.slug}, ${SALON_TZ})`,
      `  staff       ${staffBySlug.size}`,
      `  services    ${serviceBySlug.size} across ${CATEGORY_SEEDS.length} categories`,
      `  clients     ${clientByFirst.size}`,
      `  appts today ${APPT_SEEDS.length}`,
    ].join("\n"),
  );
}

// Build today's UTC window [00:00, next-day 00:00) in the given IANA timezone.
// Implemented without date-fns-tz so the seed has zero extra deps — uses
// Intl.DateTimeFormat to read the wall-clock components and then iteratively
// refines the offset (handles DST).
function todayBoundsInTimezone(timeZone: string): { fromUtc: Date; toUtc: Date } {
  const now = new Date();
  const parts = formatPartsInTz(now, timeZone);
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T00:00:00`;
  const fromUtc = utcFromLocalIso(isoLocal, timeZone);
  const next = new Date(fromUtc.getTime() + 24 * 60 * 60 * 1000);
  // DST days are 23 or 25 hours long — recompute the next midnight in TZ.
  const nextParts = formatPartsInTz(next, timeZone);
  const nextIsoLocal = `${nextParts.year}-${nextParts.month}-${nextParts.day}T00:00:00`;
  const toUtc = utcFromLocalIso(nextIsoLocal, timeZone);
  return { fromUtc, toUtc };
}

function utcInstantForLocalTime(hour: number, minute: number, timeZone: string): Date {
  const now = new Date();
  const parts = formatPartsInTz(now, timeZone);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${hh}:${mm}:00`;
  return utcFromLocalIso(isoLocal, timeZone);
}

// Convert "2026-04-29T14:30:00" interpreted as wall-clock time in the given
// timezone to a UTC instant. Two-pass refinement handles the DST edge cases
// where adding the offset from the naive guess produces a different offset.
function utcFromLocalIso(isoLocal: string, timeZone: string): Date {
  const guessAsUtc = new Date(isoLocal + "Z");
  const offsetMs1 = tzOffsetMs(guessAsUtc, timeZone);
  const refined = new Date(guessAsUtc.getTime() - offsetMs1);
  const offsetMs2 = tzOffsetMs(refined, timeZone);
  if (offsetMs2 === offsetMs1) return refined;
  return new Date(guessAsUtc.getTime() - offsetMs2);
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = formatPartsInTz(instant, timeZone);
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return localAsUtc - instant.getTime();
}

function formatPartsInTz(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant).reduce<Record<string, string>>(
    (acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    },
    {},
  );
  // hour:24 ("00".."23") — Intl quirk: "24" can show up at midnight.
  if (parts.hour === "24") parts.hour = "00";
  return parts as {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Copy .env.example to .env at the repo root.`,
    );
  }
  return value;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
