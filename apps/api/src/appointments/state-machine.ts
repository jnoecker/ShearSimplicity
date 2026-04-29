import { AppointmentStatus } from "@prisma/client";

// Allowed transitions for appointments. Reschedule and cancellation are
// modeled as separate verbs (each has its own endpoint and event), so this
// table only covers status flips driven by the front desk's status menu.
//
// Terminal states (`COMPLETED`, `CANCELLED`, `NO_SHOW`) have no outgoing
// edges — once an appointment lands there it stays there and any subsequent
// correction lives in a follow-up appointment + adjustment, not a status
// rewind.
const TRANSITIONS: Record<AppointmentStatus, ReadonlyArray<AppointmentStatus>> = {
  SCHEDULED: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(
  from: AppointmentStatus,
): ReadonlyArray<AppointmentStatus> {
  return TRANSITIONS[from];
}

// Reschedule and cancel run through their own endpoints; they're allowed only
// before completion (COMPLETED) and never on already-cancelled / no-show rows.
const NON_TERMINAL: ReadonlySet<AppointmentStatus> = new Set([
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
]);

export function canReschedule(status: AppointmentStatus): boolean {
  // Disallow reschedule once the visit is in progress — at that point the
  // stylist is mid-cut and reschedule is the wrong verb (cancel + new booking).
  return status === "SCHEDULED" || status === "CONFIRMED" || status === "CHECKED_IN";
}

export function canCancel(status: AppointmentStatus): boolean {
  return NON_TERMINAL.has(status);
}

export function isTerminal(status: AppointmentStatus): boolean {
  return !NON_TERMINAL.has(status);
}

// Statuses that count for stylist-overlap purposes. Cancelled and no-show
// appointments free up the slot.
export const BLOCKING_STATUSES: ReadonlyArray<AppointmentStatus> = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
];
