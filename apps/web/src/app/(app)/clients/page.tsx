import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input, PageHeader } from "@/components/form";

interface Client {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
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
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Search by name, phone, or email."
        action={
          <Link href="/clients/new">
            <Button>New client</Button>
          </Link>
        }
      />
      <Card>
        <form className="flex gap-2" action="/clients">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search clients…"
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Card>
      {clients.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            {q ? `No clients match "${q}".` : "No clients yet."}
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-200">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-zinc-50"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-900">
                      {c.displayName}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {[c.phone, c.email].filter(Boolean).join(" · ") ||
                        "No contact info"}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
