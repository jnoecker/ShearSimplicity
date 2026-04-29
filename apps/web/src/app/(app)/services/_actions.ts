"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  serviceCategoryCreateSchema,
  serviceCategoryUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@shearsimp/shared";
import { apiFetch, ApiError } from "@/lib/api";

export interface FormState {
  errors?: Record<string, string>;
  message?: string;
}

function toFormErrors(parsed: { error: { issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }> } }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of parsed.error.issues) {
    const k = i.path.join(".") || "_";
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

function readService(formData: FormData) {
  const categoryRaw = formData.get("categoryId");
  const categoryId =
    categoryRaw === null || categoryRaw === "" ? null : String(categoryRaw);
  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    categoryId,
    description: optional(formData.get("description")),
    defaultDurationMinutes: parseInt(
      String(formData.get("defaultDurationMinutes") ?? ""),
      10,
    ),
    // Form collects dollars; convert to integer cents at the boundary.
    defaultPriceCents: dollarsToCents(formData.get("defaultPriceDollars")),
    currency: String(formData.get("currency") ?? "USD"),
    isActive: formData.get("isActive") === "on",
  };
}

function optional(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  const s = String(v);
  return s.length === 0 ? undefined : s;
}

function dollarsToCents(v: FormDataEntryValue | null): number {
  if (v === null) return Number.NaN;
  const dollars = parseFloat(String(v));
  if (!Number.isFinite(dollars)) return Number.NaN;
  return Math.round(dollars * 100);
}

export async function createServiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = serviceCreateSchema.safeParse(readService(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>("/services", {
      method: "POST",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/services");
  redirect(`/services/${created.id}`);
}

export async function updateServiceAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = serviceUpdateSchema.safeParse(readService(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch(`/services/${id}`, { method: "PATCH", data: parsed.data });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/services");
  revalidatePath(`/services/${id}`);
  return { message: "Saved." };
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = serviceCategoryCreateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    sortOrder: parseInt(String(formData.get("sortOrder") ?? "0"), 10),
  });
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch("/service-categories", {
      method: "POST",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/services");
  revalidatePath("/services/categories");
  return { message: "Category created." };
}

export async function updateCategoryAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = serviceCategoryUpdateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    sortOrder: parseInt(String(formData.get("sortOrder") ?? "0"), 10),
  });
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch(`/service-categories/${id}`, {
      method: "PATCH",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/services");
  revalidatePath("/services/categories");
  return { message: "Saved." };
}
