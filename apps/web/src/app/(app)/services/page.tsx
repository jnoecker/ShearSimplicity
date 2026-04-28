import { EmptyState } from "@/components/empty-state";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Services
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Service catalog with categories, default duration, and pricing.
        </p>
      </header>
      <EmptyState
        title="Service catalog coming in Phase 2"
        body="Categories, default durations, and prices live here. Bookings snapshot these values so historical records stay accurate."
        phase="Phase 2"
      />
    </div>
  );
}
