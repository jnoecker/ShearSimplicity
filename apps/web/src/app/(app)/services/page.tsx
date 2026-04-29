import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, PageHeader } from "@/components/form";
import { categoryKind, type CategoryKind } from "@/lib/service-categories";

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
  const groups = new Map<
    string,
    { name: string; kind: CategoryKind; services: ServiceRow[] }
  >();
  const uncat: ServiceRow[] = [];
  for (const s of services) {
    if (s.category) {
      const g = groups.get(s.category.id) ?? {
        name: s.category.name,
        kind: categoryKind({ categoryName: s.category.name }),
        services: [],
      };
      g.services.push(s);
      groups.set(s.category.id, g);
    } else {
      uncat.push(s);
    }
  }
  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="Services"
        description={`${services.length} bookable service${services.length === 1 ? "" : "s"}.`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/services/categories">
              <Button variant="secondary">Categories</Button>
            </Link>
            <Link href="/services/new">
              <Button>+ New service</Button>
            </Link>
          </div>
        }
      />

      {services.length === 0 ? (
        <Card>
          <p className="ss-empty">
            No services yet. Add one to start booking appointments.
          </p>
        </Card>
      ) : (
        <>
          {sortedGroups.map((g) => (
            <ServiceSection
              key={g.name}
              title={g.name}
              kind={g.kind}
              services={g.services}
            />
          ))}
          {uncat.length > 0 && (
            <ServiceSection title="Uncategorized" kind="cut" services={uncat} />
          )}
        </>
      )}
    </>
  );
}

function ServiceSection({
  title,
  kind,
  services,
}: {
  title: string;
  kind: CategoryKind;
  services: ServiceRow[];
}) {
  return (
    <section className={`ss-svc-section is-${kind}`}>
      <header className="ss-svc-section-head">
        <div className="ss-svc-section-rule" />
        <div className="ss-svc-section-title">
          <h3>{title}</h3>
          <span className="ss-svc-section-count">
            {services.length} service{services.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      <div className="ss-svc-grid">
        {services.map((s) => (
          <Link key={s.id} href={`/services/${s.id}`} className="ss-svc-card">
            <div className="ss-svc-icon">
              <ScissorsIcon />
            </div>
            <div>
              <div className="ss-svc-name">{s.name}</div>
              <div className="ss-svc-desc">{s.slug}</div>
            </div>
            <div className="ss-svc-meta">
              <div className="ss-svc-price">
                {formatPrice(s.defaultPriceCents, s.currency)}
              </div>
              <div className="ss-svc-dur">{s.defaultDurationMinutes} min</div>
              {!s.isActive && (
                <div className="ss-svc-inactive">Inactive</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ScissorsIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.121 14.121 20 20M5.636 18.364a3 3 0 1 1 4.243-4.243 3 3 0 0 1-4.243 4.243Zm0-12.728a3 3 0 1 1 4.243 4.243 3 3 0 0 1-4.243-4.243Zm6.364 6.364L20 4" />
    </svg>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
