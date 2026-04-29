import Link from "next/link";
import { Card, PageHeader } from "@/components/form";
import { ClientForm } from "../_components/client-form";
import { createClientAction } from "../_actions";

export default function NewClientPage() {
  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="New client"
        description="Add a client profile."
        action={
          <Link href="/clients" className="ss-link">
            ← Back to clients
          </Link>
        }
      />
      <Card>
        <ClientForm action={createClientAction} submitLabel="Create client" />
      </Card>
    </>
  );
}
