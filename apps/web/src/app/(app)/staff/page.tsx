import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, PageHeader } from "@/components/form";

interface StaffRow {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  isActive: boolean;
}

export default async function StaffPage() {
  const staff = await apiFetch<StaffRow[]>("/staff");
  const active = staff.filter((s) => s.isActive);
  const inactive = staff.filter((s) => !s.isActive);

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff"
        description={`${active.length} active${inactive.length > 0 ? `, ${inactive.length} inactive` : ""}.`}
        action={
          <Link href="/staff/new">
            <Button>+ New stylist</Button>
          </Link>
        }
      />

      {staff.length === 0 ? (
        <Card>
          <p className="ss-empty">
            No staff yet. Add your first stylist to start scheduling.
          </p>
        </Card>
      ) : (
        <div className="ss-chair-strip">
          {staff.map((s) => (
            <Link key={s.id} href={`/staff/${s.id}`} className="ss-chair">
              <div className="ss-chair-head">
                <div
                  className="ss-chair-avatar"
                  style={{
                    background: s.color
                      ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                      : "linear-gradient(135deg, #1ec3d9, #0892a8)",
                  }}
                >
                  {initialsOf(s.displayName)}
                </div>
                <div>
                  <div className="ss-chair-name">{s.displayName}</div>
                  {s.title && <div className="ss-chair-role">{s.title}</div>}
                </div>
              </div>
              <div className="ss-chair-stat">
                <span>{s.isActive ? "Active" : "Inactive"}</span>
                <strong>Edit →</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
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
