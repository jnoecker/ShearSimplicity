"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientCreateSchema, clientUpdateSchema } from "@shearsimp/shared";
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

function readClient(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: optional(formData.get("lastName")),
    displayName: optional(formData.get("displayName")),
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    notes: optional(formData.get("notes")),
  };
}

function optional(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  const s = String(v);
  return s.length === 0 ? undefined : s;
}

export async function createClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = clientCreateSchema.safeParse(readClient(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>("/clients", {
      method: "POST",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClientAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = clientUpdateSchema.safeParse(readClient(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch(`/clients/${id}`, { method: "PATCH", data: parsed.data });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { message: "Saved." };
}
