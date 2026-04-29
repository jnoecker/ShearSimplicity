"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  staffCreateSchema,
  staffUpdateSchema,
  workingHoursReplaceSchema,
} from "@shearsimp/shared";
import { apiFetch, ApiError } from "@/lib/api";

export interface FormState {
  errors?: Record<string, string>;
  message?: string;
}

interface StaffRow {
  id: string;
}

function toFormErrors(parsed: { error: { issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }> } }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function readStaffForm(formData: FormData) {
  return {
    displayName: String(formData.get("displayName") ?? ""),
    title: optionalString(formData.get("title")),
    color: optionalString(formData.get("color")),
    bio: optionalString(formData.get("bio")),
    isActive: formData.get("isActive") === "on",
  };
}

function optionalString(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  const s = String(v);
  return s.length === 0 ? undefined : s;
}

export async function createStaffAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = staffCreateSchema.safeParse(readStaffForm(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  let created: StaffRow;
  try {
    created = await apiFetch<StaffRow>("/staff", {
      method: "POST",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/staff");
  redirect(`/staff/${created.id}`);
}

export async function updateStaffAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = staffUpdateSchema.safeParse(readStaffForm(formData));
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch(`/staff/${id}`, { method: "PATCH", data: parsed.data });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { message: "Saved." };
}

// Working-hours form posts a list of windows as JSON in a hidden input —
// simpler than reconstructing a 7-day grid out of FormData entries here, and
// keeps client-side serialization explicit.
export async function replaceWorkingHoursAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let windows: unknown;
  try {
    windows = JSON.parse(String(formData.get("windows") ?? "[]"));
  } catch {
    return { errors: { _: "Could not parse working hours" } };
  }
  const parsed = workingHoursReplaceSchema.safeParse({ windows });
  if (!parsed.success) return { errors: toFormErrors(parsed) };

  try {
    await apiFetch(`/staff/${id}/working-hours`, {
      method: "PUT",
      data: parsed.data,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return { errors: e.fieldMessages() ?? {}, message: e.topMessage() };
    }
    throw e;
  }
  revalidatePath(`/staff/${id}`);
  return { message: "Working hours saved." };
}
