import Link from "next/link";
import { Card, PageHeader } from "@/components/form";
import { StaffForm } from "../_components/staff-form";
import { createStaffAction } from "../_actions";

export default function NewStaffPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New stylist"
        description="Add a stylist to the schedule."
      />
      <Card>
        <StaffForm action={createStaffAction} submitLabel="Create stylist" />
      </Card>
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
