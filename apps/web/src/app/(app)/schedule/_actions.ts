"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

function fail(e: unknown): ActionResult {
  if (e instanceof ApiError) {
    return { ok: false, message: e.topMessage() };
  }
  if (e instanceof Error) {
    return { ok: false, message: e.message };
  }
  return { ok: false, message: "Request failed" };
}

export async function rescheduleAppointment(input: {
  id: string;
  startAtIso: string;
  staffMemberId?: string;
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${input.id}/reschedule`, {
      method: "POST",
      data: {
        startAt: input.startAtIso,
        ...(input.staffMemberId ? { staffMemberId: input.staffMemberId } : {}),
      },
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function transitionAppointment(input: {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "NO_SHOW";
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${input.id}/transition`, {
      method: "POST",
      data: { status: input.status },
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function completeAppointment(
  id: string,
): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${id}/complete`, {
      method: "POST",
      data: {},
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelAppointment(input: {
  id: string;
  reason?: string;
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${input.id}/cancel`, {
      method: "POST",
      data: { reason: input.reason ?? "" },
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
