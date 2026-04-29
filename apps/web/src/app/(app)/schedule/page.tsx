import { format as formatTz, fromZonedTime } from "date-fns-tz";
import { apiFetch } from "@/lib/api";
import {
  dayWindow,
  formatDayLabel,
  shiftIsoDate,
  todayIsoInTimezone,
} from "@/lib/salon-time";
import {
  ScheduleView,
  type ScheduleAppointment,
  type SchedulePayment,
  type ScheduleStaff,
  type ScheduleService,
} from "./_components/schedule-view";
import { BookingModalMount } from "./_components/booking-modal-mount";
import type {
  BookClient,
  BookService,
  BookStaff,
} from "./_components/book-appointment-modal";
import type { BookCalendarAppointment } from "./_components/book-calendar";

interface SettingsResponse {
  id: string;
  name: string;
  timezone: string;
}

const VIEW_MONTH = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Server-side fetches all the data the calendar needs in parallel: the salon
// timezone (for day boundaries and labels), the active stylist roster, the
// services list (for color coding), and the appointments overlapping the
// chosen day window. When `?book=1` is set, also fetches the data the
// booking modal needs (clients + monthAppointments) so it can mount.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    book?: string;
    month?: string;
    staff?: string;
    client?: string;
    paid?: string;
    paymentCancelled?: string;
  }>;
}) {
  const params = await searchParams;
  const settings = await apiFetch<SettingsResponse>("/settings");
  const tz = settings.timezone;
  const isoDate = params.date ?? todayIsoInTimezone(tz);
  const window = dayWindow(isoDate, tz);

  const bookOpen = params.book === "1";

  const [appointments, staff, services] = await Promise.all([
    apiFetch<ScheduleAppointment[]>("/appointments", {
      query: {
        from: window.fromUtc.toISOString(),
        to: window.toUtc.toISOString(),
      },
    }),
    apiFetch<ScheduleStaff[]>("/staff"),
    apiFetch<ScheduleService[]>("/services"),
  ]);

  // Fetch the day's payments after the appointment query so we can scope
  // by ID. The /payments endpoint hard-caps the list at 500 ids per
  // request and 400s on over-limit input — chunk into matching batches
  // so a wildly busy salon doesn't lose rows from a silent truncation.
  const payments = await fetchPaymentsForAppointments(
    appointments.map((a) => a.id),
  );

  const prevIso = shiftIsoDate(isoDate, -1, tz);
  const nextIso = shiftIsoDate(isoDate, 1, tz);
  const todayIso = todayIsoInTimezone(tz);
  const dayLabel = formatDayLabel(isoDate, tz);

  // Booking-modal data is only fetched when the modal is actually open —
  // a closed-modal page load shouldn't pay for a clients list or a
  // month-wide appointments query.
  let bookingData: Awaited<ReturnType<typeof loadBookingData>> | null = null;
  if (bookOpen) {
    bookingData = await loadBookingData({
      tz,
      isoDate,
      monthParam: params.month,
    });
  }

  return (
    <>
      <ScheduleView
        isoDate={isoDate}
        timezone={tz}
        dayLabel={dayLabel}
        prevIso={prevIso}
        nextIso={nextIso}
        todayIso={todayIso}
        appointments={appointments}
        staff={staff.filter((s) => s.isActive)}
        services={services}
        payments={payments}
        paidAppointmentId={params.paid ?? null}
        paymentCancelledAppointmentId={params.paymentCancelled ?? null}
      />
      {bookOpen && bookingData && (
        <BookingModalMount
          timezone={tz}
          initialDate={safeIsoDate(params.date, todayIso)}
          initialStaffId={params.staff ?? null}
          initialClientId={params.client ?? null}
          staff={bookingData.staff.filter((s) => s.isActive)}
          services={bookingData.services.filter((s) => s.isActive)}
          clients={bookingData.clients}
          viewMonth={bookingData.viewMonth}
          prevMonthIso={bookingData.prevMonthIso}
          nextMonthIso={bookingData.nextMonthIso}
          todayIso={todayIso}
          monthAppointments={bookingData.monthAppointments}
          closeHref={`/schedule?date=${isoDate}`}
        />
      )}
    </>
  );
}

// Stay under the API's MAX_LOOKUP_IDS (500). 400 leaves a comfortable
// margin and keeps the URL short enough to not stress any proxy.
const PAYMENTS_LOOKUP_BATCH = 400;

async function fetchPaymentsForAppointments(
  appointmentIds: string[],
): Promise<SchedulePayment[]> {
  if (appointmentIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < appointmentIds.length; i += PAYMENTS_LOOKUP_BATCH) {
    chunks.push(appointmentIds.slice(i, i + PAYMENTS_LOOKUP_BATCH));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      apiFetch<SchedulePayment[]>("/payments", {
        query: { appointmentIds: chunk.join(",") },
      }),
    ),
  );
  return results.flat();
}

async function loadBookingData({
  tz,
  isoDate,
  monthParam,
}: {
  tz: string;
  isoDate: string;
  monthParam: string | undefined;
}) {
  const fallbackMonth = isoDate.slice(0, 7);
  const viewMonth =
    monthParam && VIEW_MONTH.test(monthParam) ? monthParam : fallbackMonth;
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

  return {
    viewMonth,
    prevMonthIso,
    nextMonthIso,
    staff,
    services,
    clients,
    monthAppointments,
  };
}

// `?date=` flows into the modal's selected state and then into
// instantAtMinutes() at submit time — a malformed value would throw
// there and abort the flow. Validate up front and quietly fall back.
function safeIsoDate(input: string | undefined, fallback: string): string {
  if (!input || !ISO_DATE.test(input)) return fallback;
  const [y, m, d] = input.split("-").map(Number);
  if (!y || !m || !d) return fallback;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return fallback;
  }
  return input;
}

// UTC window covering the salon-local calendar grid for "YYYY-MM". Buffer a
// week on each side so the leading/trailing days from neighbor months still
// render their density bars correctly in the month grid.
function monthRange(viewMonth: string, timezone: string) {
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const firstOfMonth = `${viewMonth}-01`;
  const fromAnchor = fromZonedTime(`${firstOfMonth}T12:00:00`, timezone);
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
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  const ny = base.getUTCFullYear();
  const nm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(base.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}
