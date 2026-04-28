import { EmptyState } from "@/components/empty-state";

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Staff
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stylists, working hours, and roles.
        </p>
      </header>
      <EmptyState
        title="Staff management coming in Phase 2"
        body="Profiles, working hours, color tags, and role assignment land here."
        phase="Phase 2"
      />
    </div>
  );
}
