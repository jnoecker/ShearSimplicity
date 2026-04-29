import { EmptyState } from "@/components/empty-state";

export default function SchedulePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Calendar, stylist availability, and conflict detection.
        </p>
      </header>
      <EmptyState
        title="Calendar coming in Phase 3"
        body="Day/week/stylist views, drag-to-reschedule, and conflict detection will live here."
        phase="Phase 3"
      />
    </div>
  );
}
