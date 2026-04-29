import Link from "next/link";
import { format as formatTz, fromZonedTime } from "date-fns-tz";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/form";
import { todayIsoInTimezone } from "@/lib/salon-time";
import {
  BookAppointmentForm,
  type BookClient,
  type BookService,
  type BookStaff,
} from "../_components/book-appointment-form";
import type { BookCalendarAppointment } from "../_components/book-calendar";

interface SettingsResponse {
  timezone: string;
}

const VIEW_MONTH = /^\d{4}-\d{2}$/;

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    staff?: string;
    client?: string;
    month?: string;
  }>;
}) {
  const params = await searchParams;
  const settings = await apiFetch<SettingsResponse>("/settings");
  const tz = settings.timezone;
  const todayIso = todayIsoInTimezone(tz);
  const initialDate = params.date ?? todayIso;

  // Default the month view to whichever month the selected date sits in.
  // If the caller passes ?month explicitly, it wins so the calendar can
  // navigate independently of the picked date.
  const fallbackMonth = initialDate.slice(0, 7);
  const viewMonth =
    params.month && VIEW_MONTH.test(params.month) ? params.month : fallbackMonth;

  const monthBounds = monthRange(viewMonth, tz);
  const prevMonthIso = shiftYearMonth(viewMonth, -1);
  const nextMonthIso = shiftYearMonth(viewMonth, 1);

  const [staff, services, clients, monthAppointments] = await Promise.all([
    apiFetch<BookStaff[]>("/staff"),
    apiFetch<BookService[]>("/services"),
    apiFetch<BookClient[]>("/clients"),
    apiFetch<BookCalendarAppointment[]>("/appointments", {
      query: {
        from: monthBounds.fromUtc.toISOString(),
        to: monthBounds.toUtc.toISOString(),
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Book an appointment"
        description="Pick a client, services, and stylist, then choose an open slot. Conflicts are rejected by the API."
        action={
          <Link href="/schedule" className="ss-link">
            ← Back to schedule
          </Link>
        }
      />

      <BookAppointmentForm
        timezone={tz}
        initialDate={initialDate}
        initialStaffId={params.staff ?? null}
        initialClientId={params.client ?? null}
        staff={staff.filter((s) => s.isActive)}
        services={services.filter((s) => s.isActive)}
        clients={clients}
        viewMonth={viewMonth}
        prevMonthIso={prevMonthIso}
        nextMonthIso={nextMonthIso}
        todayIso={todayIso}
        monthAppointments={monthAppointments}
      />
    </>
  );
}

// Compute the UTC window covering the salon-local calendar grid for a given
// "YYYY-MM". We grab a buffer week on each side so the month view's leading /
// trailing days from neighbor months still show their density bars.
function monthRange(viewMonth: string, timezone: string) {
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const firstOfMonth = `${viewMonth}-01`;
  const fromAnchor = fromZonedTime(`${firstOfMonth}T12:00:00`, timezone);
  // Walk back to the Sunday on or before the first.
  const dow = Number(formatTz(fromAnchor, "i", { timeZone: timezone })); // 1..7 Mon..Sun
  const offsetToSunday = dow === 7 ? 0 : -dow;
  const fromUtc = fromZonedTime(
    addDays(firstOfMonth, offsetToSunday) + "T00:00:00",
    timezone,
  );
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = `${viewMonth}-${String(lastDay).padStart(2, "0")}`;
  const toAnchor = fromZonedTime(`${lastOfMonth}T12:00:00`, timezone);
  const lastDow = Number(formatTz(toAnchor, "i", { timeZone: timezone }));
  const offsetToSaturday = lastDow === 6 ? 1 : ((6 - lastDow) % 7) + 1;
  const toUtc = fromZonedTime(
    addDays(lastOfMonth, offsetToSaturday) + "T00:00:00",
    timezone,
  );
  return { fromUtc, toUtc };
}

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return yearMonth;
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  // Calendar arithmetic on YYYY-MM-DD without crossing into a Date object —
  // safe because we never reinterpret the result through any timezone.
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  const ny = base.getUTCFullYear();
  const nm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(base.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}
