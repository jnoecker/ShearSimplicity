import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { ServiceForm, type CategoryOption } from "../_components/service-form";
import { createServiceAction } from "../_actions";

export default async function NewServicePage() {
  const categories = await apiFetch<CategoryOption[]>("/service-categories");
  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="New service"
        description="Add a service to the catalog."
        action={
          <Link href="/services" className="ss-link">
            ← Back to services
          </Link>
        }
      />
      <Card>
        <ServiceForm
          action={createServiceAction}
          categories={categories}
          submitLabel="Create service"
        />
      </Card>
    </>
  );
}
