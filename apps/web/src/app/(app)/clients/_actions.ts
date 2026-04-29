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
    // For nullable model fields we pass the empty string through so the shared
    // schema's transforms collapse it to null — that's how a user clears a
    // previously-saved value. Treating empty as undefined would silently drop
    // the change on update.
    lastName: passthrough(formData.get("lastName")),
    email: passthrough(formData.get("email")),
    phone: passthrough(formData.get("phone")),
    notes: passthrough(formData.get("notes")),
    // displayName is non-null in the model; empty means "no change" rather
    // than "clear" (clientCreateSchema's First-Last fallback handles new rows).
    displayName: omitIfBlank(formData.get("displayName")),
  };
}

function passthrough(v: FormDataEntryValue | null): string | undefined {
  return v === null ? undefined : String(v);
}

function omitIfBlank(v: FormDataEntryValue | null): string | undefined {
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
