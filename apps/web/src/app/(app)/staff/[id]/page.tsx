import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { StaffForm } from "../_components/staff-form";
import { WorkingHoursForm } from "../_components/working-hours-form";
import {
  StaffServicesForm,
  type ServiceOption,
} from "../_components/staff-services-form";
import {
  replaceStaffServicesAction,
  replaceWorkingHoursAction,
  updateStaffAction,
  type FormState,
} from "../_actions";

interface WorkingHoursRow {
  dayOfWeek: number;
  startMinutesFromMidnight: number;
  endMinutesFromMidnight: number;
}

interface StaffDetail {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  bio: string | null;
  isActive: boolean;
  workingHours: WorkingHoursRow[];
  serviceIds: string[];
}

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [staff, services] = await Promise.all([
    apiFetch<StaffDetail>(`/staff/${id}`),
    apiFetch<ServiceOption[]>("/services"),
  ]);

  // Bind the staff id into the action so the client form doesn't need to
  // smuggle it via a hidden field.
  const updateAction = async (
    state: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    "use server";
    return updateStaffAction(id, state, formData);
  };
  const hoursAction = async (
    state: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    "use server";
    return replaceWorkingHoursAction(id, state, formData);
  };
  const servicesAction = async (
    state: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    "use server";
    return replaceStaffServicesAction(id, state, formData);
  };

  return (
    <>
      <PageHeader
        eyebrow="Stylist"
        title={staff.displayName}
        description={staff.title ?? "Stylist"}
        action={
          <Link href="/staff" className="ss-link">
            ← Back to staff
          </Link>
        }
      />

      <Card title="Profile" meta={staff.isActive ? "Active" : "Inactive"}>
        <StaffForm
          action={updateAction}
          submitLabel="Save changes"
          defaults={{
            displayName: staff.displayName,
            title: staff.title,
            color: staff.color,
            bio: staff.bio,
            isActive: staff.isActive,
          }}
        />
      </Card>

      <Card title="Services" meta="What this stylist can perform">
        <StaffServicesForm
          action={servicesAction}
          services={services}
          initialIds={staff.serviceIds}
        />
      </Card>

      <Card title="Working hours" meta="Per weekday">
        <WorkingHoursForm action={hoursAction} initial={staff.workingHours} />
      </Card>
    </>
  );
}
