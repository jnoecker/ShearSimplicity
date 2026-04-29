// Single source of truth for how each appointment status renders. Used by
// the schedule view, the dashboard timeline, and the client-history list so
// a CANCELLED row never picks up confirmed-styling and an IN_PROGRESS row
// always reads as in-progress, etc.

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

interface PillStyle {
  /** CSS modifier on `.ss-status-pill` (defined in styles.css + extras). */
  cls: string;
  /** Human label for the pill. */
  label: string;
}

const PILLS: Record<AppointmentStatus, PillStyle> = {
  SCHEDULED:   { cls: "is-pending",   label: "scheduled" },
  CONFIRMED:   { cls: "is-confirmed", label: "confirmed" },
  CHECKED_IN:  { cls: "is-checked",   label: "checked in" },
  IN_PROGRESS: { cls: "is-progress",  label: "in progress" },
  COMPLETED:   { cls: "is-checked",   label: "completed" },
  CANCELLED:   { cls: "is-cancelled", label: "cancelled" },
  NO_SHOW:     { cls: "is-cancelled", label: "no-show" },
};

export function statusPill(status: AppointmentStatus): PillStyle {
  return PILLS[status];
}
