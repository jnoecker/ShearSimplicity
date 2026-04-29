import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { ServiceForm, type CategoryOption } from "../_components/service-form";
import { createServiceAction } from "../_actions";

export default async function NewServicePage() {
  const categories = await apiFetch<CategoryOption[]>("/service-categories");
  return (
    <div className="space-y-6">
      <PageHeader
        title="New service"
        description="Add a service to the catalog."
      />
      <Card>
        <ServiceForm
          action={createServiceAction}
          categories={categories}
          submitLabel="Create service"
        />
      </Card>
      <div>
        <Link
          href="/services"
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← Back to services
        </Link>
      </div>
    </div>
  );
}
