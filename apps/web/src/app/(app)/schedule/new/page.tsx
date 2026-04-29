import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/form";
import { todayIsoInTimezone } from "@/lib/salon-time";
import {
  BookAppointmentForm,
  type BookClient,
  type BookService,
  type BookStaff,
} from "../_components/book-appointment-form";

interface SettingsResponse {
  timezone: string;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; staff?: string; client?: string }>;
}) {
  const params = await searchParams;
  const settings = await apiFetch<SettingsResponse>("/settings");
  const tz = settings.timezone;
  const initialDate = params.date ?? todayIsoInTimezone(tz);

  const [staff, services, clients] = await Promise.all([
    apiFetch<BookStaff[]>("/staff"),
    apiFetch<BookService[]>("/services"),
    apiFetch<BookClient[]>("/clients"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Book an appointment"
        description="Pick a client, services, stylist, and time. The schedule will reject conflicts."
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
      />
    </>
  );
}
