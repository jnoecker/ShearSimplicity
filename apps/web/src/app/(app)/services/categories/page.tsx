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
    <div className="space-y-6">
      <PageHeader
        title="Service categories"
        description="Group services for the booking screen and reports."
      />
      <Card>
        <CategoryCreateForm action={createCategoryAction} />
      </Card>
      {categories.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">No categories yet.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-zinc-200">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <span className="text-sm font-medium text-zinc-900">
                  {c.name}
                </span>
                <span className="text-xs text-zinc-500">
                  Order {c.sortOrder}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
