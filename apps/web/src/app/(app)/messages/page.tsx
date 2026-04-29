import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/form";

export default function MessagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Conversations"
        title="Messages"
        description="SMS confirmations, reminders, and client replies."
      />
      <EmptyState
        title="Messaging arrives in Phase 4"
        body="Twilio-backed SMS confirmations, reminder jobs, and inbound reply logs land here. Requires A2P 10DLC registration before going live."
        phase="Phase 4"
      />
    </>
  );
}
