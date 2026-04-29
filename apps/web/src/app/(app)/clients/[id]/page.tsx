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

  // Lifetime spend: sum every service snapshot across every visit. Currency
  // is taken from the first service we see — a salon could in theory have
  // multi-currency rows, but in that edge case the formatted total is still
  // a reasonable approximation.
  const lifetimeCents = client.appointments.reduce(
    (acc, a) =>
      acc + a.services.reduce((s, sv) => s + sv.priceSnapshotCents, 0),
    0,
  );
  const currency =
    client.appointments[0]?.services[0]?.currencySnapshot ?? "USD";
  const lastVisit = client.appointments
    .filter((a) => new Date(a.startAt).getTime() <= Date.now())
    .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];

  return (
    <>
      <PageHeader
        eyebrow={`Clients · ${client.displayName}`}
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

      <div className="ss-profile-grid">
        <div>
          <div className="ss-profile-hero">
            <div className="ss-profile-photo">
              {initialsOf(client.displayName)}
            </div>
            <h3 className="ss-profile-name">{client.displayName}</h3>
            <div className="ss-profile-since">
              {client.appointments.length > 0
                ? `${client.appointments.length} visit${client.appointments.length === 1 ? "" : "s"} on the books`
                : "No appointments yet"}
            </div>

            {client.notes && (
              <div className="ss-profile-tags">
                <span className="ss-tag is-regular">{truncate(client.notes, 32)}</span>
              </div>
            )}

            <div className="ss-profile-actions">
              <Link href="/schedule" className="ss-btn ss-btn-primary ss-btn-block">
                <PlusIcon /> Book
              </Link>
            </div>

            <dl className="ss-profile-meta">
              <div>
                <dt>Phone</dt>
                <dd>{client.phone ?? "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{client.email ?? "—"}</dd>
              </div>
              <div>
                <dt>First name</dt>
                <dd>{client.firstName}</dd>
              </div>
              <div>
                <dt>Last name</dt>
                <dd>{client.lastName ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="ss-profile-side">
          <div className="ss-profile-stats">
            <div className="ss-mini-stat">
              <div className="ss-mini-stat-v">{client.appointments.length}</div>
              <div className="ss-mini-stat-l">visits</div>
            </div>
            <div className="ss-mini-stat">
              <div className="ss-mini-stat-v">
                {formatPrice(lifetimeCents, currency)}
              </div>
              <div className="ss-mini-stat-l">lifetime</div>
            </div>
            <div className="ss-mini-stat">
              <div className="ss-mini-stat-v">
                {lastVisit
                  ? new Date(lastVisit.startAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </div>
              <div className="ss-mini-stat-l">last visit</div>
            </div>
          </div>

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

          <Card
            title="Appointment history"
            meta={`${client.appointments.length} on record`}
          >
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
        </div>
      </div>
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatPrice(cents: number, currency: string): string {
  // Format with the currency's natural minor units. Hardcoding
  // maximumFractionDigits:0 truncates real cents (e.g., $54.99 → $55) and the
  // services list elsewhere already shows full precision — this stays
  // consistent with that.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
