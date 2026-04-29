import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import {
  ServiceForm,
  type CategoryOption,
  type ServiceDefaults,
} from "../_components/service-form";
import { updateServiceAction, type FormState } from "../_actions";

interface ServiceDetail extends ServiceDefaults {
  id: string;
  name: string;
  slug: string;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
  currency: string;
  isActive: boolean;
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [service, categories] = await Promise.all([
    apiFetch<ServiceDetail>(`/services/${id}`),
    apiFetch<CategoryOption[]>("/service-categories"),
  ]);

  const action = async (
    state: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    "use server";
    return updateServiceAction(id, state, formData);
  };

  return (
    <>
      <PageHeader
        eyebrow="Service"
        title={service.name}
        description={service.slug}
        action={
          <Link href="/services" className="ss-link">
            ← Back to services
          </Link>
        }
      />
      <Card title="Edit" meta={service.isActive ? "Active" : "Inactive"}>
        <ServiceForm
          action={action}
          categories={categories}
          submitLabel="Save changes"
          defaults={{
            name: service.name,
            slug: service.slug,
            categoryId: service.categoryId,
            description: service.description,
            defaultDurationMinutes: service.defaultDurationMinutes,
            defaultPriceCents: service.defaultPriceCents,
            currency: service.currency,
            isActive: service.isActive,
          }}
        />
      </Card>
    </>
  );
}
