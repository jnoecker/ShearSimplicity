import Link from "next/link";
import { Card, PageHeader } from "@/components/form";
import { ClientForm } from "../_components/client-form";
import { createClientAction } from "../_actions";

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New client" description="Add a client profile." />
      <Card>
        <ClientForm action={createClientAction} submitLabel="Create client" />
      </Card>
      <div>
        <Link
          href="/clients"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Back to clients
        </Link>
      </div>
    </div>
  );
}
