"use server";

import { revalidatePath } from "next/cache";
import { salonSettingsUpdateSchema } from "@shearsimp/shared";
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

export async function updateSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawSms = optional(formData.get("smsFromNumber"));
  const raw = {
    name: optional(formData.get("name")),
    timezone: optional(formData.get("timezone")),
    // Distinguish "field absent" from "user cleared the input". The form
    // always submits the field, so an empty string means "clear it" → null.
    // A non-submission (no key in formData) means "leave it alone" →
    // undefined, which the zod schema treats as no-op.
    smsFromNumber: formData.has("smsFromNumber")
      ? rawSms ?? null
      : undefined,
  };
  const parsed = salonSettingsUpdateSchema.safeParse(raw);
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch("/settings", { method: "PATCH", data: parsed.data });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/settings");
  return { message: "Saved." };
}

function optional(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  const s = String(v);
  return s.length === 0 ? undefined : s;
}
