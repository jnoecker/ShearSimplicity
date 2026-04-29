import { EmptyState } from "@/components/empty-state";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Today's appointments, recent activity, and quick actions live here
          once Phase 3 lands.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card label="Today's appointments" value="—" />
        <Card label="New clients (7d)" value="—" />
        <Card label="Revenue (today)" value="—" />
      </div>
      <EmptyState
        title="Nothing to show yet"
        body="Once you have appointments, clients, and services, this dashboard will pull live numbers from the API."
        phase="Phase 3"
      />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        {value}
      </div>
    </div>
  );
}
