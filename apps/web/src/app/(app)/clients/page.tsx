import { EmptyState } from "@/components/empty-state";

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Clients
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Client profiles, contact info, and appointment history.
        </p>
      </header>
      <EmptyState
        title="Client list coming in Phase 2"
        body="Search, profiles, and appointment history will live here."
        phase="Phase 2"
      />
    </div>
  );
}
