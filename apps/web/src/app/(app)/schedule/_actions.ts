"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** When the API returns a created resource we want to navigate to. */
  appointmentId?: string;
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

interface ClientSearchHit {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
}

// Server-side client search so the booking flow stays correct beyond the API
// list cap (take: 200 on /clients). The same `q` parameter the GET /clients
// endpoint already supports does the heavy lifting; we just forward it.
export async function searchClientsAction(
  q: string,
): Promise<ClientSearchHit[]> {
  const trimmed = q.trim();
  try {
    return await apiFetch<ClientSearchHit[]>("/clients", {
      query: { q: trimmed.length > 0 ? trimmed : undefined },
    });
  } catch {
    return [];
  }
}

export async function createAppointmentAction(input: {
  clientId: string;
  staffMemberId: string;
  serviceIds: string[];
  startAtIso: string;
  notes?: string;
  internalNotes?: string;
}): Promise<ActionResult> {
  try {
    const created = await apiFetch<{ id: string }>("/appointments", {
      method: "POST",
      data: {
        clientId: input.clientId,
        staffMemberId: input.staffMemberId,
        serviceIds: input.serviceIds,
        startAt: input.startAtIso,
        notes: input.notes && input.notes.length > 0 ? input.notes : undefined,
        internalNotes:
          input.internalNotes && input.internalNotes.length > 0
            ? input.internalNotes
            : undefined,
      },
    });
    revalidatePath("/schedule");
    return { ok: true, appointmentId: created.id };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleAppointment(input: {
  id: string;
  startAtIso: string;
  staffMemberId?: string;
  /** "one" (default) reschedules just this occurrence. "following" cascades
   *  the same delta to every future occurrence in the series and resets the
   *  series anchor. Ignored on appointments without a seriesId. */
  scope?: "one" | "following";
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${input.id}/reschedule`, {
      method: "POST",
      data: {
        startAt: input.startAtIso,
        ...(input.staffMemberId ? { staffMemberId: input.staffMemberId } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
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
  /** "one" (default) cancels just this visit. "following" cancels this
   *  occurrence + all future occurrences and ends the series. Ignored on
   *  appointments without a seriesId. */
  scope?: "one" | "following";
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointments/${input.id}/cancel`, {
      method: "POST",
      data: {
        reason: input.reason ?? "",
        ...(input.scope ? { scope: input.scope } : {}),
      },
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Recurring appointments (series) ----------

export async function createSeriesAction(input: {
  clientId: string;
  staffMemberId: string;
  serviceIds: string[];
  startAtIso: string;
  everyNWeeks: number;
  /** null = indefinite (the regular long-term-client case). */
  stopAfterVisits: number | null;
  notes?: string;
  internalNotes?: string;
}): Promise<ActionResult> {
  try {
    const created = await apiFetch<{ id: string }>("/appointment-series", {
      method: "POST",
      data: {
        clientId: input.clientId,
        staffMemberId: input.staffMemberId,
        serviceIds: input.serviceIds,
        startAt: input.startAtIso,
        everyNWeeks: input.everyNWeeks,
        stopAfterVisits: input.stopAfterVisits,
        notes: input.notes && input.notes.length > 0 ? input.notes : undefined,
        internalNotes:
          input.internalNotes && input.internalNotes.length > 0
            ? input.internalNotes
            : undefined,
      },
    });
    revalidatePath("/schedule");
    return { ok: true, appointmentId: created.id };
  } catch (e) {
    return fail(e);
  }
}

export async function extendSeriesAction(input: {
  seriesId: string;
  additionalVisits: number;
}): Promise<ActionResult> {
  try {
    await apiFetch(`/appointment-series/${input.seriesId}/extend`, {
      method: "POST",
      data: { additionalVisits: input.additionalVisits },
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function convertSeriesToIndefiniteAction(input: {
  seriesId: string;
}): Promise<ActionResult> {
  try {
    await apiFetch(
      `/appointment-series/${input.seriesId}/convert-to-indefinite`,
      { method: "POST", data: {} },
    );
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Server action wrapper for the checkout flow. Calls the API to create a
 * Stripe Checkout Session for an appointment (with optional tip), then
 * routes the user to the returned URL via Next's redirect() — which
 * throws a special control-flow exception, so this function "returns"
 * only on the failure path.
 */
export async function startCheckoutAction(
  appointmentId: string,
  tipCents = 0,
): Promise<ActionResult> {
  let url: string;
  try {
    const res = await apiFetch<{ url: string; paymentId: string }>(
      "/payments/checkout",
      {
        method: "POST",
        data: { appointmentId, tipCents: tipCents > 0 ? tipCents : undefined },
      },
    );
    url = res.url;
  } catch (e) {
    return fail(e);
  }
  // redirect() throws — must be outside the try / catch so Next's
  // NEXT_REDIRECT control-flow exception isn't swallowed by `fail()`.
  redirect(url);
}

export async function refundPaymentAction(
  paymentId: string,
  amountCents?: number,
): Promise<ActionResult> {
  try {
    await apiFetch(`/payments/${paymentId}/refund`, {
      method: "POST",
      data: amountCents !== undefined ? { amountCents } : {},
    });
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
