import { apiFetch } from "@/lib/api";
import {
  dayWindow,
  formatDayLabel,
  shiftIsoDate,
  todayIsoInTimezone,
} from "@/lib/salon-time";
import { ScheduleView, type ScheduleAppointment, type ScheduleStaff, type ScheduleService } from "./_components/schedule-view";

interface SettingsResponse {
  id: string;
  name: string;
  timezone: string;
}

// Server-side fetches all the data the calendar needs in parallel: the salon
// timezone (for day boundaries and labels), the active stylist roster, the
// services list (for color coding), and the appointments overlapping the
// chosen day window.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const settings = await apiFetch<SettingsResponse>("/settings");
  const tz = settings.timezone;
  const isoDate = params.date ?? todayIsoInTimezone(tz);
  const window = dayWindow(isoDate, tz);

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

  const prevIso = shiftIsoDate(isoDate, -1, tz);
  const nextIso = shiftIsoDate(isoDate, 1, tz);
  const todayIso = todayIsoInTimezone(tz);
  const dayLabel = formatDayLabel(isoDate, tz);

  return (
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
    />
  );
}
