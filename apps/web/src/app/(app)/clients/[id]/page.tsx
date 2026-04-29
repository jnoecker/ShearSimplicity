import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { ClientForm } from "../_components/client-form";
import { updateClientAction, type FormState } from "../_actions";

interface AppointmentRow {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  staffMember: { id: string; displayName: string };
  services: Array<{
    serviceNameSnapshot: string;
    priceSnapshotCents: number;
    currencySnapshot: string;
  }>;
}

interface ClientDetail {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  appointments: AppointmentRow[];
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await apiFetch<ClientDetail>(`/clients/${id}`);

  const action = async (
    state: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    "use server";
    return updateClientAction(id, state, formData);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={client.displayName} description="Client profile" />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Profile
        </h2>
        <Card>
          <ClientForm
            action={action}
            submitLabel="Save changes"
            defaults={{
              firstName: client.firstName,
              lastName: client.lastName,
              displayName: client.displayName,
              email: client.email,
              phone: client.phone,
              notes: client.notes,
            }}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Appointment history
        </h2>
        <Card className={client.appointments.length === 0 ? undefined : "p-0"}>
          {client.appointments.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No appointments yet. Booking lands in Phase 3.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {client.appointments.map((a) => (
                <li key={a.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-900">
                        {new Date(a.startAt).toLocaleString()}
                      </div>
                      <div className="text-xs text-zinc-500">
                        With {a.staffMember.displayName} ·{" "}
                        {a.services
                          .map((s) => s.serviceNameSnapshot)
                          .join(", ") || "No services"}
                      </div>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {a.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

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
