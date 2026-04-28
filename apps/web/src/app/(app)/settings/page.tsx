import { EmptyState } from "@/components/empty-state";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Salon details, branding, business hours, and integrations.
        </p>
      </header>
      <EmptyState
        title="Settings coming in Phase 2"
        body="Salon profile, business hours, payment provider, and SMS sender configuration."
        phase="Phase 2"
      />
    </div>
  );
}
