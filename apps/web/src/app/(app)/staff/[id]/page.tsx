import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { StaffForm } from "../_components/staff-form";
import { WorkingHoursForm } from "../_components/working-hours-form";
import {
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
}

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await apiFetch<StaffDetail>(`/staff/${id}`);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={staff.displayName}
        description={staff.title ?? "Stylist"}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Profile
        </h2>
        <Card>
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
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Working hours
        </h2>
        <Card>
          <WorkingHoursForm action={hoursAction} initial={staff.workingHours} />
        </Card>
      </section>

      <div>
        <Link
          href="/staff"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Back to staff
        </Link>
      </div>
    </div>
  );
}
