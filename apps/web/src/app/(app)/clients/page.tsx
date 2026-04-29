import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, PageHeader } from "@/components/form";

interface Client {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const clients = await apiFetch<Client[]>("/clients", {
    query: { q: q || undefined },
  });

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Clients"
        description={
          q
            ? `Searching for "${q}"`
            : `${clients.length} ${clients.length === 1 ? "client" : "clients"} in the studio.`
        }
        action={
          <Link href="/clients/new">
            <Button>+ Add client</Button>
          </Link>
        }
      />

      <form className="ss-toolbar" action="/clients">
        <div className="ss-search ss-toolbar-search">
          <SearchIcon />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, phone, or email…"
          />
        </div>
        <Button variant="secondary" type="submit">
          Search
        </Button>
      </form>

      {clients.length === 0 ? (
        <Card>
          <p className="ss-empty">
            {q ? `No clients match "${q}".` : "No clients yet."}
          </p>
        </Card>
      ) : (
        <Card noPadding>
          <table className="ss-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ss-msg-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                      {initialsOf(c.displayName)}
                    </div>
                    <div>
                      <div className="ss-client-name">
                        <Link href={`/clients/${c.id}`} className="ss-link-plain">
                          {c.displayName}
                        </Link>
                      </div>
                      {c.firstName && c.lastName && (
                        <div className="ss-client-mute">
                          {c.firstName} {c.lastName}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="ss-client-mute">{c.phone ?? "—"}</span>
                  </td>
                  <td>
                    <span className="ss-client-mute">{c.email ?? "—"}</span>
                  </td>
                  <td>
                    <span className="ss-client-mute">
                      {c.notes ? truncate(c.notes, 60) : "—"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/clients/${c.id}`} className="ss-link">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
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
