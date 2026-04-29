import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, PageHeader } from "@/components/form";
import { CategoryCreateForm } from "../_components/category-form";
import { createCategoryAction } from "../_actions";

interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export default async function ServiceCategoriesPage() {
  const categories = await apiFetch<Category[]>("/service-categories");

  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="Service categories"
        description="Group services for the booking screen and reports."
        action={
          <Link href="/services" className="ss-link">
            ← Back to services
          </Link>
        }
      />
      <Card title="Add a category">
        <CategoryCreateForm action={createCategoryAction} />
      </Card>
      <Card title="Categories" meta={`${categories.length} total`} noPadding>
        {categories.length === 0 ? (
          <p className="ss-empty" style={{ padding: 24 }}>
            No categories yet.
          </p>
        ) : (
          <ul className="ss-stack-list">
            {categories.map((c) => (
              <li key={c.id}>
                <span className="ss-list-name">{c.name}</span>
                <span className="ss-list-meta">Order {c.sortOrder}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
