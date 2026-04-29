import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, PageHeader } from "@/components/form";

interface Category {
  id: string;
  name: string;
}

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
  currency: string;
  category: Category | null;
}

export default async function ServicesPage() {
  const services = await apiFetch<ServiceRow[]>("/services");

  // Group by category for the list view; uncategorized lands at the bottom.
  const groups = new Map<string, { name: string; services: ServiceRow[] }>();
  const uncat: ServiceRow[] = [];
  for (const s of services) {
    if (s.category) {
      const g = groups.get(s.category.id) ?? {
        name: s.category.name,
        services: [],
      };
      g.services.push(s);
      groups.set(s.category.id, g);
    } else {
      uncat.push(s);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="The catalog of bookable services."
        action={
          <div className="flex gap-2">
            <Link href="/services/categories">
              <Button variant="secondary">Categories</Button>
            </Link>
            <Link href="/services/new">
              <Button>New service</Button>
            </Link>
          </div>
        }
      />
      {services.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No services yet. Add one to start booking appointments.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups.values()]
            .map((g) => ({ ...g, sortKey: g.name.toLowerCase() }))
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map((g) => (
              <ServiceGroup
                key={g.name}
                title={g.name}
                services={g.services}
              />
            ))}
          {uncat.length > 0 && (
            <ServiceGroup title="Uncategorized" services={uncat} />
          )}
        </div>
      )}
    </div>
  );
}

function ServiceGroup({
  title,
  services,
}: {
  title: string;
  services: ServiceRow[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <Card className="p-0">
        <ul className="divide-y divide-zinc-200">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={`/services/${s.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-zinc-50"
              >
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    {s.name}
                  </div>
                  <div className="text-xs text-zinc-500">{s.slug}</div>
                </div>
                <div className="flex items-center gap-4 text-sm text-zinc-600">
                  <span>{s.defaultDurationMinutes} min</span>
                  <span>{formatPrice(s.defaultPriceCents, s.currency)}</span>
                  {!s.isActive && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Inactive
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
