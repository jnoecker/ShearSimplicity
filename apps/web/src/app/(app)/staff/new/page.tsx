import Link from "next/link";
import { Card, PageHeader } from "@/components/form";
import { StaffForm } from "../_components/staff-form";
import { createStaffAction } from "../_actions";

export default function NewStaffPage() {
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="New stylist"
        description="Add a stylist to the schedule."
        action={
          <Link href="/staff" className="ss-link">
            ← Back to staff
          </Link>
        }
      />
      <Card>
        <StaffForm action={createStaffAction} submitLabel="Create stylist" />
      </Card>
    </>
  );
}
