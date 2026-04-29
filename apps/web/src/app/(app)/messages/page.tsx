import { EmptyState } from "@/components/empty-state";

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Messages
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          SMS confirmations, reminders, and client replies.
        </p>
      </header>
      <EmptyState
        title="Messaging coming in Phase 4"
        body="Twilio-backed SMS confirmations, reminder jobs, and inbound reply logs land here. Requires A2P 10DLC registration before going live."
        phase="Phase 4"
      />
    </div>
  );
}
