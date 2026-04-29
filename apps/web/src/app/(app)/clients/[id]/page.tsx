import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import {
  statusPill,
  type AppointmentStatus,
} from "@/lib/appointment-status";
import { ClientForm } from "../_components/client-form";
import { updateClientAction, type FormState } from "../_actions";

interface AppointmentRow {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
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
    <>
      <PageHeader
        eyebrow="Client"
        title={client.displayName}
        description={
          [client.phone, client.email].filter(Boolean).join(" · ") ||
          "No contact info on file"
        }
        action={
          <Link href="/clients" className="ss-link">
            ← Back to clients
          </Link>
        }
      />

      <Card title="Profile" meta="Editable">
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

      <Card title="Appointment history" meta={`${client.appointments.length} on record`}>
        {client.appointments.length === 0 ? (
          <p className="ss-empty">No appointments yet.</p>
        ) : (
          <ul className="ss-history">
            {client.appointments.map((a) => {
              const pill = statusPill(a.status);
              return (
                <li key={a.id} className="ss-history-row">
                  <div>
                    <div className="ss-history-svc">
                      {a.services
                        .map((s) => s.serviceNameSnapshot)
                        .join(" · ") || "—"}
                    </div>
                    <div className="ss-history-meta">
                      With <strong>{a.staffMember.displayName}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ss-history-date">
                      {new Date(a.startAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <span className={`ss-status-pill ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
