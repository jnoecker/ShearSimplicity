"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categoryKind, type CategoryKind } from "@/lib/service-categories";
import {
  formatTimeInTimezone,
  instantAtMinutes,
  minutesFromDayStart,
} from "@/lib/salon-time";
import {
  cancelAppointment,
  completeAppointment,
  rescheduleAppointment,
  startCheckoutAction,
  transitionAppointment,
} from "../_actions";

// Minutes-since-day-start grid. The calendar opens at SLOT_START minutes (9 AM
// default) and runs until SLOT_END (7 PM). 15-minute granularity at 14px/slot
// matches the design — 56px per hour, fits a 10-hour day in 560px.
const SLOT_MIN = 15;
const SLOT_HEIGHT = 14;
const SLOT_START_MIN = 9 * 60;
const SLOT_END_MIN = 19 * 60;
const TOTAL_SLOTS = (SLOT_END_MIN - SLOT_START_MIN) / SLOT_MIN;
const DRAG_MIME = "application/x-shearsimp-appointment";

const STAFF_GRADIENTS = [
  "linear-gradient(135deg, #1ec3d9, #0892a8)",
  "linear-gradient(135deg, #0892a8, #4a82b3)",
  "linear-gradient(135deg, #4a82b3, #1ec3d9)",
  "linear-gradient(135deg, #5cdcec, #0892a8)",
  "linear-gradient(135deg, #1ec3d9, #6fa6cc)",
  "linear-gradient(135deg, #0892a8, #5cdcec)",
];

export interface ScheduleStaff {
  id: string;
  displayName: string;
  title: string | null;
  color: string | null;
  isActive: boolean;
}

export interface ScheduleService {
  id: string;
  name: string;
  category: { id: string; name: string } | null;
}

export interface ScheduleAppointmentService {
  serviceId: string;
  serviceNameSnapshot: string;
}

export interface ScheduleAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status:
    | "SCHEDULED"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "NO_SHOW";
  notes: string | null;
  internalNotes: string | null;
  client: { id: string; displayName: string; phone: string | null };
  staffMember: { id: string; displayName: string };
  services: ScheduleAppointmentService[];
}

export type SchedulePaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CANCELLED";

export interface SchedulePayment {
  id: string;
  appointmentId: string;
  status: SchedulePaymentStatus;
  amountCents: number;
  currency: string;
  receiptUrl: string | null;
  capturedAt: string | null;
}

interface Props {
  isoDate: string;
  timezone: string;
  dayLabel: string;
  prevIso: string;
  nextIso: string;
  todayIso: string;
  appointments: ScheduleAppointment[];
  staff: ScheduleStaff[];
  services: ScheduleService[];
  /** One row per appointment that has any payment activity, deduped by the
   *  API to the highest-priority status (SUCCEEDED wins over PENDING). */
  payments: SchedulePayment[];
  /** When set, the user just returned from a successful Stripe redirect for
   *  this appointment id — the view shows a banner until they dismiss it. */
  paidAppointmentId: string | null;
  paymentCancelledAppointmentId: string | null;
}

const LEGEND: Array<{ k: CategoryKind; l: string }> = [
  { k: "color", l: "Color services" },
  { k: "cut", l: "Cuts" },
  { k: "styling", l: "Styling" },
  { k: "treat", l: "Treatments" },
  { k: "bridal", l: "Bridal & special" },
  { k: "block", l: "Blocked" },
];

interface RenderBlock {
  appointment: ScheduleAppointment;
  staffIndex: number;
  startMin: number;
  durationMin: number;
  kind: CategoryKind;
  payment: SchedulePayment | null;
}

function staffGradient(index: number): string {
  return STAFF_GRADIENTS[index % STAFF_GRADIENTS.length];
}

export function ScheduleView({
  isoDate,
  timezone,
  dayLabel,
  prevIso,
  nextIso,
  todayIso,
  appointments,
  staff,
  services,
  payments,
  paidAppointmentId,
  paymentCancelledAppointmentId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const paymentByAppointmentId = useMemo(() => {
    const map = new Map<string, SchedulePayment>();
    for (const p of payments) map.set(p.appointmentId, p);
    return map;
  }, [payments]);

  function dismissReturnBanner() {
    // Drop the paid / paymentCancelled query params so the banner doesn't
    // re-show on refresh. Keep the existing date param.
    const qs = new URLSearchParams();
    qs.set("date", isoDate);
    router.replace(`/schedule?${qs.toString()}`);
  }
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverDrop, setHoverDrop] = useState<{
    staffIndex: number;
    slot: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Lookup table from serviceId to its category kind (for color coding).
  // Keyed by snapshot service id rather than name so it's stable across
  // service renames.
  const kindForServiceId = useMemo(() => {
    const map = new Map<string, CategoryKind>();
    for (const s of services) {
      map.set(
        s.id,
        categoryKind({
          categoryName: s.category?.name ?? null,
          serviceName: s.name,
        }),
      );
    }
    return map;
  }, [services]);

  const blocks: RenderBlock[] = useMemo(() => {
    const staffIndex = new Map<string, number>();
    staff.forEach((s, i) => staffIndex.set(s.id, i));
    const out: RenderBlock[] = [];
    for (const a of appointments) {
      // Hide cancelled / no-show: they shouldn't paint over the slot any more.
      // (BLOCKING_STATUSES on the API side already excludes these for conflict
      // detection; mirroring that here keeps the visual consistent.)
      if (a.status === "CANCELLED" || a.status === "NO_SHOW") continue;
      const idx = staffIndex.get(a.staffMember.id);
      if (idx === undefined) continue;
      const startMin = minutesFromDayStart(
        new Date(a.startAt),
        isoDate,
        timezone,
      );
      const endMin = minutesFromDayStart(
        new Date(a.endAt),
        isoDate,
        timezone,
      );
      const kind =
        a.services
          .map((s) => kindForServiceId.get(s.serviceId))
          .find((k): k is CategoryKind => Boolean(k)) ?? "cut";
      out.push({
        appointment: a,
        staffIndex: idx,
        startMin,
        durationMin: Math.max(SLOT_MIN, endMin - startMin),
        kind,
        payment: paymentByAppointmentId.get(a.id) ?? null,
      });
    }
    return out;
  }, [appointments, staff, kindForServiceId, isoDate, timezone, paymentByAppointmentId]);

  const selected = useMemo(
    () =>
      selectedId
        ? appointments.find((a) => a.id === selectedId) ?? null
        : null,
    [selectedId, appointments],
  );

  function onDragStart(e: React.DragEvent, appointmentId: string) {
    e.dataTransfer.setData(DRAG_MIME, appointmentId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(appointmentId);
  }
  function onDragEnd() {
    setDraggingId(null);
    setHoverDrop(null);
  }
  function onDragOver(e: React.DragEvent, staffIndex: number, slot: number) {
    if (!e.dataTransfer.types.includes(DRAG_MIME) && !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (
      hoverDrop?.staffIndex !== staffIndex ||
      hoverDrop?.slot !== slot
    ) {
      setHoverDrop({ staffIndex, slot });
    }
  }
  function onDrop(e: React.DragEvent, staffIndex: number, slot: number) {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData(DRAG_MIME) || draggingId;
    setHoverDrop(null);
    setDraggingId(null);
    if (!appointmentId) return;

    const block = blocks.find((b) => b.appointment.id === appointmentId);
    if (!block) return;

    const newStartMin = SLOT_START_MIN + slot * SLOT_MIN;
    if (
      block.staffIndex === staffIndex &&
      block.startMin === newStartMin
    ) {
      return;
    }
    const targetStaff = staff[staffIndex];
    if (!targetStaff) return;
    const newStartIso = instantAtMinutes(
      newStartMin,
      isoDate,
      timezone,
    ).toISOString();

    setErrorMsg(null);
    startTransition(async () => {
      const result = await rescheduleAppointment({
        id: appointmentId,
        startAtIso: newStartIso,
        staffMemberId:
          block.staffIndex === staffIndex ? undefined : targetStaff.id,
      });
      if (!result.ok) {
        setErrorMsg(result.message ?? "Reschedule failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <header className="ss-page-head">
        <div className="ss-page-eyebrow">Schedule</div>
        <h2 className="ss-page-title">{dayLabel}</h2>
        <p className="ss-page-sub">
          {staff.length} stylists. Drag a block to reschedule, click for
          details.
        </p>
      </header>

      {paidAppointmentId && (
        <PaymentReturnBanner
          tone="success"
          message="Payment received. Stripe is finalising — the status badge will update once the webhook arrives."
          onDismiss={dismissReturnBanner}
        />
      )}
      {paymentCancelledAppointmentId && (
        <PaymentReturnBanner
          tone="info"
          message="Checkout was cancelled. The appointment is unchanged."
          onDismiss={dismissReturnBanner}
        />
      )}

      <div className="ss-schedule-toolbar">
        <div className="ss-schedule-toolbar-group">
          <Link
            href={`/schedule?date=${prevIso}`}
            className="ss-icon-btn"
            aria-label="Previous day"
          >
            <ChevIcon dir="left" />
          </Link>
          <Link
            href={`/schedule?date=${todayIso}`}
            className="ss-btn ss-btn-ghost"
          >
            Today
          </Link>
          <Link
            href={`/schedule?date=${nextIso}`}
            className="ss-icon-btn"
            aria-label="Next day"
          >
            <ChevIcon dir="right" />
          </Link>
          <span className="ss-schedule-toolbar-meta">{dayLabel}</span>
        </div>
        <Link
          href={`/schedule?book=1&date=${isoDate}`}
          className="ss-btn ss-btn-primary"
        >
          + New booking
        </Link>
      </div>

      {errorMsg && (
        <div className="ss-schedule-error" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="ss-cal-legend">
        {LEGEND.map(({ k, l }) => (
          <div key={k} className="ss-cal-legend-item">
            <span className={`ss-cal-legend-swatch is-${k}`} />
            <span>{l}</span>
          </div>
        ))}
      </div>

      {staff.length === 0 ? (
        <div className="ss-card" style={{ padding: 24, textAlign: "center" }}>
          No active stylists. Add staff in{" "}
          <Link href="/staff" className="ss-link">
            Staff
          </Link>{" "}
          to populate the calendar.
        </div>
      ) : (
        <div
          className="ss-cal"
          style={{
            gridTemplateColumns: `56px repeat(${staff.length}, 1fr)`,
            opacity: isPending ? 0.7 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          <div className="ss-cal-h is-corner" />
          {staff.map((s, i) => (
            <div
              key={s.id}
              className="ss-cal-h"
              style={
                {
                  ["--ss-staff-grad" as string]:
                    s.color
                      ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                      : staffGradient(i),
                } as React.CSSProperties
              }
            >
              <div
                className="ss-chair-avatar"
                style={{
                  background:
                    s.color
                      ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                      : staffGradient(i),
                  width: 30,
                  height: 30,
                  fontSize: 12,
                }}
              >
                {initialsOf(s.displayName)}
              </div>
              <div>
                <div className="ss-cal-h-name">
                  {s.displayName.split(" ")[0]}
                </div>
                {s.title && (
                  <div className="ss-cal-h-role">{s.title}</div>
                )}
              </div>
            </div>
          ))}

          {Array.from({ length: TOTAL_SLOTS }).map((_, slot) => {
            const isHour = slot % 4 === 0;
            const isHalf = slot % 4 === 2;
            const minutes = SLOT_START_MIN + slot * SLOT_MIN;
            const rowCls = `ss-cal-row${isHour ? " is-hour" : isHalf ? " is-half" : " is-quarter"}`;
            return (
              <ScheduleRow
                key={slot}
                slot={slot}
                isHour={isHour}
                rowCls={rowCls}
                hourLabel={
                  isHour
                    ? formatTimeInTimezone(
                        instantAtMinutes(minutes, isoDate, timezone),
                        timezone,
                      )
                    : ""
                }
                staff={staff}
                blocks={blocks.filter(
                  (b) => slotForBlock(b) === slot,
                )}
                hoverDrop={hoverDrop}
                draggingId={draggingId}
                selectedId={selectedId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onSelect={(id) => setSelectedId(id)}
                timezone={timezone}
              />
            );
          })}
        </div>
      )}

      {selected && (
        <DetailsPanel
          appointment={selected}
          payment={paymentByAppointmentId.get(selected.id) ?? null}
          timezone={timezone}
          isPending={isPending}
          onClose={() => setSelectedId(null)}
          onAction={(run) => {
            setErrorMsg(null);
            startTransition(async () => {
              const r = await run();
              if (!r.ok) {
                setErrorMsg(r.message ?? "Action failed");
                return;
              }
              setSelectedId(null);
              router.refresh();
            });
          }}
        />
      )}
    </>
  );
}

// Row of one time-column + N stylist columns. Pulled out so React can
// memoize per-slot work and so the drop targets stay independent.
function ScheduleRow({
  slot,
  isHour,
  rowCls,
  hourLabel,
  staff,
  blocks,
  hoverDrop,
  draggingId,
  selectedId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onSelect,
  timezone,
}: {
  slot: number;
  isHour: boolean;
  rowCls: string;
  hourLabel: string;
  staff: ScheduleStaff[];
  blocks: RenderBlock[];
  hoverDrop: { staffIndex: number; slot: number } | null;
  draggingId: string | null;
  selectedId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, staffIndex: number, slot: number) => void;
  onDrop: (e: React.DragEvent, staffIndex: number, slot: number) => void;
  onSelect: (id: string) => void;
  timezone: string;
}) {
  return (
    <>
      <div className={`ss-cal-time${isHour ? " is-hour" : ""}`}>
        {hourLabel}
      </div>
      {staff.map((_, ci) => {
        const block = blocks.find((b) => b.staffIndex === ci);
        const isHover =
          hoverDrop?.staffIndex === ci && hoverDrop?.slot === slot;
        return (
          <div
            className={`ss-cal-cell ${rowCls}${isHover ? " is-drop-target" : ""}`}
            key={`${ci}-${slot}`}
            style={{ height: SLOT_HEIGHT }}
            onDragOver={(e) => onDragOver(e, ci, slot)}
            onDrop={(e) => onDrop(e, ci, slot)}
          >
            {block && (
              <AppointmentBlock
                block={block}
                isDragging={draggingId === block.appointment.id}
                isSelected={selectedId === block.appointment.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onSelect={onSelect}
                timezone={timezone}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function AppointmentBlock({
  block,
  isDragging,
  isSelected,
  onDragStart,
  onDragEnd,
  onSelect,
  timezone,
}: {
  block: RenderBlock;
  isDragging: boolean;
  isSelected: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onSelect: (id: string) => void;
  timezone: string;
}) {
  const { appointment, durationMin, kind, payment } = block;
  const heightPx = (durationMin / SLOT_MIN) * SLOT_HEIGHT - 4;
  const time = formatTimeInTimezone(new Date(appointment.startAt), timezone);
  const services = appointment.services
    .map((s) => s.serviceNameSnapshot)
    .join(" · ");
  const paymentBadgeKind = payment ? badgeKindFor(payment.status) : null;
  return (
    <div
      className={`ss-cal-block is-${kind}${isSelected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ top: 0, height: `${heightPx}px` }}
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => onDragStart(e, appointment.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(appointment.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(appointment.id);
        }
      }}
    >
      <div className="ss-cal-block-name">
        {appointment.client.displayName}
        {paymentBadgeKind && (
          <span
            className={`ss-cal-block-pay is-${paymentBadgeKind}`}
            title={`Payment: ${payment!.status.toLowerCase()}`}
            aria-label={`Payment ${payment!.status.toLowerCase()}`}
          >
            $
          </span>
        )}
      </div>
      <div className="ss-cal-block-svc">
        {time} · {services || "Service"}
      </div>
    </div>
  );
}

function badgeKindFor(status: SchedulePaymentStatus): "paid" | "pending" | "issue" {
  if (status === "SUCCEEDED") return "paid";
  if (status === "PENDING") return "pending";
  return "issue";
}

function DetailsPanel({
  appointment,
  payment,
  timezone,
  isPending,
  onClose,
  onAction,
}: {
  appointment: ScheduleAppointment;
  payment: SchedulePayment | null;
  timezone: string;
  isPending: boolean;
  onClose: () => void;
  onAction: (
    run: () => Promise<{ ok: boolean; message?: string }>,
  ) => void;
}) {
  const start = formatTimeInTimezone(new Date(appointment.startAt), timezone);
  const end = formatTimeInTimezone(new Date(appointment.endAt), timezone);
  const services = appointment.services
    .map((s) => s.serviceNameSnapshot)
    .join(", ");

  // Map current status to the next legal "advance" verb. Mirrors the API's
  // state machine so users only see actions that won't 409.
  const advanceTarget: Array<{
    label: string;
    status: "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "NO_SHOW";
  }> =
    appointment.status === "SCHEDULED"
      ? [
          { label: "Confirm", status: "CONFIRMED" },
          { label: "Check in", status: "CHECKED_IN" },
          { label: "No-show", status: "NO_SHOW" },
        ]
      : appointment.status === "CONFIRMED"
        ? [
            { label: "Check in", status: "CHECKED_IN" },
            { label: "No-show", status: "NO_SHOW" },
          ]
        : appointment.status === "CHECKED_IN"
          ? [{ label: "Start", status: "IN_PROGRESS" }]
          : [];

  const canComplete = appointment.status === "IN_PROGRESS";
  const canCancel = !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
    appointment.status,
  );

  return (
    <div className="ss-detail-panel" role="dialog" aria-label="Appointment details">
      <button
        type="button"
        className="ss-detail-close"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <div className="ss-page-eyebrow">{appointment.status.replace("_", " ")}</div>
      <h3 className="ss-detail-title">{appointment.client.displayName}</h3>
      <p className="ss-detail-sub">
        {start} – {end} · with {appointment.staffMember.displayName}
      </p>
      <p className="ss-detail-services">{services}</p>
      {appointment.client.phone && (
        <p className="ss-detail-meta">{appointment.client.phone}</p>
      )}
      {appointment.notes && (
        <div className="ss-detail-section">
          <div className="ss-detail-label">Client notes</div>
          <p>{appointment.notes}</p>
        </div>
      )}
      {appointment.internalNotes && (
        <div className="ss-detail-section">
          <div className="ss-detail-label">Internal</div>
          <p>{appointment.internalNotes}</p>
        </div>
      )}
      <PaymentSection
        appointmentId={appointment.id}
        payment={payment}
      />
      <div className="ss-detail-actions">
        {advanceTarget.map((t) => (
          <button
            key={t.status}
            type="button"
            className="ss-btn ss-btn-primary"
            disabled={isPending}
            onClick={() =>
              onAction(() =>
                transitionAppointment({
                  id: appointment.id,
                  status: t.status,
                }),
              )
            }
          >
            {t.label}
          </button>
        ))}
        {canComplete && (
          <button
            type="button"
            className="ss-btn ss-btn-primary"
            disabled={isPending}
            onClick={() =>
              onAction(() => completeAppointment(appointment.id))
            }
          >
            Complete
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="ss-btn ss-btn-ghost"
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt("Cancellation reason (optional)") ?? "";
              onAction(() =>
                cancelAppointment({ id: appointment.id, reason }),
              );
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentSection({
  appointmentId,
  payment,
}: {
  appointmentId: string;
  payment: SchedulePayment | null;
}) {
  // The startCheckoutAction server action redirects via redirect() — it
  // throws NEXT_REDIRECT on success, so this state only flips back when
  // the API rejects (already paid → 409, missing services → 400).
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function pay() {
    setSubmitting(true);
    setErrorMsg(null);
    const result = await startCheckoutAction(appointmentId);
    // If we got here, the redirect didn't fire — that means the action
    // failed (the success path throws and never returns).
    setSubmitting(false);
    setErrorMsg(result.message ?? "Couldn't start checkout");
  }

  const succeeded = payment?.status === "SUCCEEDED";
  const failed =
    payment?.status === "FAILED" ||
    payment?.status === "CANCELLED" ||
    payment?.status === "REFUNDED" ||
    payment?.status === "PARTIALLY_REFUNDED";
  const pending = payment?.status === "PENDING";

  return (
    <div className="ss-detail-section ss-detail-payment">
      <div className="ss-detail-label">Payment</div>
      {payment && (
        <div className="ss-detail-payment-row">
          <span className={`ss-tag is-pay-${payment.status.toLowerCase()}`}>
            {payment.status.replace("_", " ").toLowerCase()}
          </span>
          <span className="ss-detail-payment-amount">
            {formatPrice(payment.amountCents, payment.currency)}
          </span>
        </div>
      )}
      {succeeded && payment?.receiptUrl && (
        <a
          className="ss-link"
          href={payment.receiptUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Stripe receipt ↗
        </a>
      )}
      {!succeeded && (
        <button
          type="button"
          className="ss-btn ss-btn-primary"
          disabled={submitting}
          onClick={pay}
        >
          {submitting
            ? "Starting checkout…"
            : pending
              ? "Resume payment"
              : failed
                ? "Try again"
                : "Pay now"}
        </button>
      )}
      {errorMsg && <div className="ss-form-error">{errorMsg}</div>}
    </div>
  );
}

function PaymentReturnBanner({
  tone,
  message,
  onDismiss,
}: {
  tone: "success" | "info";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={`ss-return-banner is-${tone}`} role="status">
      <span>{message}</span>
      <button
        type="button"
        className="ss-return-banner-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ChevIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function slotForBlock(block: RenderBlock): number {
  return Math.max(
    0,
    Math.round((block.startMin - SLOT_START_MIN) / SLOT_MIN),
  );
}
