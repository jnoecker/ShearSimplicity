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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Stylists, working hours, and roles."
        action={
          <Link href="/staff/new">
            <Button>New stylist</Button>
          </Link>
        }
      />
      {staff.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No staff yet. Add your first stylist to start scheduling.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-200">
            {staff.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/staff/${s.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full border border-zinc-200"
                      style={{ backgroundColor: s.color ?? "#e5e7eb" }}
                    />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">
                        {s.displayName}
                      </div>
                      {s.title && (
                        <div className="text-xs text-zinc-500">{s.title}</div>
                      )}
                    </div>
                  </div>
                  {!s.isActive && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Inactive
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
