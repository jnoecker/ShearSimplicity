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
  convertSeriesToIndefiniteAction,
  extendSeriesAction,
  refundPaymentAction,
  rescheduleAppointment,
  startCheckoutAction,
  transitionAppointment,
} from "../_actions";
import { CascadePromptModal } from "./cascade-prompt-modal";
import { CancelAppointmentModal } from "./cancel-appointment-modal";

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
  priceSnapshotCents: number;
  currencySnapshot: string;
}

export interface ScheduleSeriesSummary {
  id: string;
  everyNWeeks: number;
  /** null = indefinite (no cap to extend; runs forever until cancelled). */
  stopAfterVisits: number | null;
  status: "ACTIVE" | "CANCELLED" | "COMPLETED";
  anchorIndex: number;
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
  /** When set, this appointment is part of a recurring series. seriesIndex
   *  is the 1-based occurrence number within the series. */
  seriesId: string | null;
  seriesIndex: number | null;
  /** Series summary, included by the API when seriesId is set. Drives the
   *  recurring glyph, the detail-panel "every N weeks" line, and the
   *  ending-soon banner. */
  series: ScheduleSeriesSummary | null;
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
  /** Subtotal in cents (services only). */
  amountCents: number;
  /** Gratuity in cents. The total charged is amountCents + tipCents. */
  tipCents: number;
  /** Refunded so far. 0 when status is anything other than REFUNDED /
   *  PARTIALLY_REFUNDED. */
  refundedCents: number;
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
  // Stash the reschedule params from a drag-drop on a series occurrence
  // until the cascade prompt resolves. null = no prompt active.
  const [pendingReschedule, setPendingReschedule] = useState<{
    appointmentId: string;
    clientName: string;
    startAtIso: string;
    staffMemberId?: string;
  } | null>(null);
  // null = closed; { id } = open with that appointment.
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    clientName: string;
    isSeries: boolean;
  } | null>(null);

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

    const staffMemberId =
      block.staffIndex === staffIndex ? undefined : targetStaff.id;

    // Series occurrence: ask which scope before firing. Resolving the
    // prompt calls runReschedule() with the chosen scope. Non-series
    // appointments skip the prompt entirely. Both ACTIVE and COMPLETED
    // series can still have future occurrences worth cascading — only
    // CANCELLED skips the prompt (its future occurrences were already
    // cancelled when the series ended).
    if (
      block.appointment.seriesId &&
      block.appointment.series?.status !== "CANCELLED"
    ) {
      setPendingReschedule({
        appointmentId,
        clientName: block.appointment.client.displayName,
        startAtIso: newStartIso,
        staffMemberId,
      });
      return;
    }

    runReschedule({
      appointmentId,
      startAtIso: newStartIso,
      staffMemberId,
      scope: "one",
    });
  }

  function runReschedule(args: {
    appointmentId: string;
    startAtIso: string;
    staffMemberId?: string;
    scope: "one" | "following";
  }) {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await rescheduleAppointment({
        id: args.appointmentId,
        startAtIso: args.startAtIso,
        staffMemberId: args.staffMemberId,
        scope: args.scope,
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
          onRequestCancel={() =>
            setCancelTarget({
              id: selected.id,
              clientName: selected.client.displayName,
              // ACTIVE *and* COMPLETED series can still have future
              // occurrences (a finite series flips to COMPLETED as soon as
              // the cap is materialized). Only CANCELLED has nothing left
              // to cascade.
              isSeries:
                !!selected.seriesId && selected.series?.status !== "CANCELLED",
            })
          }
        />
      )}

      {pendingReschedule && (
        <CascadePromptModal
          copy={{
            title: `Move ${pendingReschedule.clientName}'s appointment`,
            body: "This visit is part of a recurring series. Apply the new time to just this one, or this and every future occurrence?",
            oneLabel: "Just this one",
            followingLabel: "This and all future",
          }}
          isPending={isPending}
          onCancel={() => setPendingReschedule(null)}
          onPick={(scope) => {
            const args = pendingReschedule;
            setPendingReschedule(null);
            runReschedule({
              appointmentId: args.appointmentId,
              startAtIso: args.startAtIso,
              staffMemberId: args.staffMemberId,
              scope,
            });
          }}
        />
      )}

      {cancelTarget && (
        <CancelAppointmentModal
          clientName={cancelTarget.clientName}
          isSeries={cancelTarget.isSeries}
          isPending={isPending}
          onClose={() => setCancelTarget(null)}
          onConfirm={({ reason, scope }) => {
            const target = cancelTarget;
            setCancelTarget(null);
            setErrorMsg(null);
            startTransition(async () => {
              const r = await cancelAppointment({
                id: target.id,
                reason,
                scope,
              });
              if (!r.ok) {
                setErrorMsg(r.message ?? "Cancel failed");
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
        {appointment.seriesId && (
          <span
            className="ss-cal-block-recur"
            title="Part of a recurring series"
            aria-label="Recurring"
          >
            ↻
          </span>
        )}
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
  onRequestCancel,
}: {
  appointment: ScheduleAppointment;
  payment: SchedulePayment | null;
  timezone: string;
  isPending: boolean;
  onClose: () => void;
  onAction: (
    run: () => Promise<{ ok: boolean; message?: string }>,
  ) => void;
  onRequestCancel: () => void;
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
      {appointment.series && appointment.seriesIndex !== null && (
        <p className="ss-detail-recur">
          <span className="ss-detail-recur-glyph" aria-hidden>↻</span>
          {seriesSummaryLine(appointment.series, appointment.seriesIndex)}
        </p>
      )}
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
      <PaymentSection appointment={appointment} payment={payment} />
      {appointment.series &&
        appointment.seriesIndex !== null &&
        shouldShowEndingBanner(appointment.series, appointment.seriesIndex) && (
          <SeriesEndingSoonBanner
            seriesId={appointment.series.id}
            seriesIndex={appointment.seriesIndex}
            stopAfterVisits={appointment.series.stopAfterVisits!}
            isPending={isPending}
            onAction={onAction}
          />
        )}
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
            onClick={onRequestCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// Tip presets shown when the user expands the "Pay now" UI. Custom is the
// escape hatch — anything from $0 up to the API's $1000 cap.
const TIP_PRESETS = [
  { label: "No tip", percent: 0 },
  { label: "15%", percent: 15 },
  { label: "18%", percent: 18 },
  { label: "20%", percent: 20 },
  { label: "25%", percent: 25 },
] as const;

function PaymentSection({
  appointment,
  payment,
}: {
  appointment: ScheduleAppointment;
  payment: SchedulePayment | null;
}) {
  const subtotalCents = useMemo(
    () =>
      appointment.services.reduce((acc, s) => acc + s.priceSnapshotCents, 0),
    [appointment.services],
  );
  const currency =
    payment?.currency ??
    appointment.services[0]?.currencySnapshot ??
    "USD";

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // null when the tip picker is collapsed; a number (0 = "no tip") when
  // the user has expanded it but not yet confirmed. Keeps "Pay now" as a
  // single tap when the tip step is visible vs. surfacing it inline.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tipPresetIndex, setTipPresetIndex] = useState<number>(2); // default 18%
  const [customTipDollars, setCustomTipDollars] = useState<string>("");
  const [customMode, setCustomMode] = useState(false);

  const tipCents = customMode
    ? Math.max(0, Math.round(Number(customTipDollars || "0") * 100))
    : Math.round(
        (subtotalCents * (TIP_PRESETS[tipPresetIndex]?.percent ?? 0)) / 100,
      );
  const totalCents = subtotalCents + tipCents;

  const succeeded = payment?.status === "SUCCEEDED";
  const refunded =
    payment?.status === "REFUNDED" ||
    payment?.status === "PARTIALLY_REFUNDED";
  const failed = payment?.status === "FAILED" || payment?.status === "CANCELLED";
  const pending = payment?.status === "PENDING";
  const totalChargedCents = payment
    ? payment.amountCents + payment.tipCents
    : 0;
  const remainingRefundableCents = payment
    ? totalChargedCents - payment.refundedCents
    : 0;
  const canRefund =
    succeeded && payment !== null && remainingRefundableCents > 0;

  // Refund picker state. Defaults to "full" — issuing the picker without
  // changing anything refunds the remaining balance, matching the previous
  // single-button behaviour.
  const [refundPickerOpen, setRefundPickerOpen] = useState(false);
  const [refundPreset, setRefundPreset] =
    useState<RefundPresetKey>("full");
  const [refundCustomMode, setRefundCustomMode] = useState(false);
  const [refundCustomDollars, setRefundCustomDollars] = useState<string>("");

  // Always re-enter the picker on the documented default (100% remaining).
  // Without this, a cancelled-then-reopened picker would silently reuse the
  // operator's prior selection, making it easy to submit a stale partial.
  function openRefundPicker() {
    setRefundPreset("full");
    setRefundCustomMode(false);
    setRefundCustomDollars("");
    setRefundPickerOpen(true);
  }
  function closeRefundPicker() {
    setRefundPickerOpen(false);
    setRefundPreset("full");
    setRefundCustomMode(false);
    setRefundCustomDollars("");
  }

  const refundAmountCents = payment
    ? refundCustomMode
      ? Math.max(
          0,
          Math.round(Number(refundCustomDollars || "0") * 100),
        )
      : refundPresetCents(refundPreset, payment, remainingRefundableCents)
    : 0;
  const refundAmountValid =
    refundAmountCents > 0 && refundAmountCents <= remainingRefundableCents;

  async function confirmAndPay() {
    setSubmitting(true);
    setErrorMsg(null);
    const result = await startCheckoutAction(appointment.id, tipCents);
    // If we got here, the redirect didn't fire — failure path.
    setSubmitting(false);
    setErrorMsg(result.message ?? "Couldn't start checkout");
  }

  async function refund() {
    if (!payment || !refundAmountValid) return;
    const remainingAfter = remainingRefundableCents - refundAmountCents;
    const amountStr = formatPriceExact(refundAmountCents, payment.currency);
    const balanceStr = formatPriceExact(remainingAfter, payment.currency);
    const message =
      remainingAfter > 0
        ? `Refund ${amountStr} to the customer? ${balanceStr} will remain refundable. This can't be undone from here.`
        : `Refund ${amountStr} to the customer? This will fully refund the payment and can't be undone from here.`;
    if (!window.confirm(message)) {
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    // When refunding the full remaining balance, omit amountCents so the
    // API takes the default (full remaining). Avoids a rounding race if the
    // refunded total shifted between render and submit.
    const amountArg =
      refundAmountCents === remainingRefundableCents
        ? undefined
        : refundAmountCents;
    const result = await refundPaymentAction(payment.id, amountArg);
    setSubmitting(false);
    if (!result.ok) {
      setErrorMsg(result.message ?? "Refund failed");
      return;
    }
    closeRefundPicker();
  }

  return (
    <div className="ss-detail-section ss-detail-payment">
      <div className="ss-detail-label">Payment</div>

      {payment && (
        <div className="ss-detail-payment-row">
          <span className={`ss-tag is-pay-${payment.status.toLowerCase()}`}>
            {payment.status.replace("_", " ").toLowerCase()}
          </span>
          <span className="ss-detail-payment-amount">
            {formatPrice(
              payment.amountCents + payment.tipCents,
              payment.currency,
            )}
          </span>
        </div>
      )}
      {payment && payment.tipCents > 0 && (
        <div className="ss-detail-payment-meta">
          Includes {formatPrice(payment.tipCents, payment.currency)} tip
        </div>
      )}
      {payment && payment.refundedCents > 0 && (
        <div className="ss-detail-payment-meta">
          {formatPrice(payment.refundedCents, payment.currency)} refunded of{" "}
          {formatPrice(totalChargedCents, payment.currency)}
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

      {!succeeded && !refunded && !pickerOpen && (
        <button
          type="button"
          className="ss-btn ss-btn-primary"
          disabled={submitting}
          onClick={() => setPickerOpen(true)}
        >
          {pending ? "Resume payment" : failed ? "Try again" : "Pay now"}
        </button>
      )}

      {!succeeded && !refunded && pickerOpen && (
        <div className="ss-tip-picker">
          <div className="ss-tip-presets">
            {TIP_PRESETS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                className={`ss-tip-chip${
                  !customMode && tipPresetIndex === i ? " is-on" : ""
                }`}
                onClick={() => {
                  setCustomMode(false);
                  setTipPresetIndex(i);
                }}
              >
                <span className="ss-tip-chip-label">{p.label}</span>
                {p.percent > 0 && (
                  <span className="ss-tip-chip-amount">
                    {formatPrice(
                      Math.round((subtotalCents * p.percent) / 100),
                      currency,
                    )}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              className={`ss-tip-chip${customMode ? " is-on" : ""}`}
              onClick={() => setCustomMode(true)}
            >
              <span className="ss-tip-chip-label">Custom</span>
            </button>
          </div>
          {customMode && (
            <div className="ss-tip-custom">
              <span>$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={customTipDollars}
                onChange={(e) => setCustomTipDollars(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="ss-tip-summary">
            <span>Subtotal</span>
            <span>{formatPrice(subtotalCents, currency)}</span>
          </div>
          {tipCents > 0 && (
            <div className="ss-tip-summary">
              <span>Tip</span>
              <span>{formatPrice(tipCents, currency)}</span>
            </div>
          )}
          <div className="ss-tip-summary is-total">
            <span>Total</span>
            <span>{formatPrice(totalCents, currency)}</span>
          </div>
          <div className="ss-tip-actions">
            <button
              type="button"
              className="ss-btn ss-btn-ghost"
              onClick={() => setPickerOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-primary"
              onClick={confirmAndPay}
              disabled={submitting}
            >
              {submitting
                ? "Starting checkout…"
                : `Pay ${formatPrice(totalCents, currency)}`}
            </button>
          </div>
        </div>
      )}

      {canRefund && !refundPickerOpen && (
        <button
          type="button"
          className="ss-btn ss-btn-ghost"
          disabled={submitting}
          onClick={openRefundPicker}
        >
          Issue refund
        </button>
      )}

      {canRefund && refundPickerOpen && payment && (
        <div className="ss-tip-picker">
          <div className="ss-tip-presets">
            {REFUND_PRESETS.map((p) => {
              const presetCents = refundPresetCents(
                p.key,
                payment,
                remainingRefundableCents,
              );
              const disabled = presetCents <= 0;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`ss-tip-chip${
                    !refundCustomMode && refundPreset === p.key ? " is-on" : ""
                  }`}
                  disabled={disabled}
                  onClick={() => {
                    setRefundCustomMode(false);
                    setRefundPreset(p.key);
                  }}
                >
                  <span className="ss-tip-chip-label">{p.label}</span>
                  <span className="ss-tip-chip-amount">
                    {formatPriceExact(presetCents, payment.currency)}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className={`ss-tip-chip${refundCustomMode ? " is-on" : ""}`}
              onClick={() => setRefundCustomMode(true)}
            >
              <span className="ss-tip-chip-label">Custom</span>
            </button>
          </div>
          {refundCustomMode && (
            <div className="ss-tip-custom">
              <span>$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={remainingRefundableCents / 100}
                step="0.01"
                placeholder="0.00"
                value={refundCustomDollars}
                onChange={(e) => setRefundCustomDollars(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="ss-tip-summary">
            <span>Refundable balance</span>
            <span>
              {formatPriceExact(
                remainingRefundableCents,
                payment.currency,
              )}
            </span>
          </div>
          <div className="ss-tip-summary is-total">
            <span>Refund</span>
            <span>
              {formatPriceExact(refundAmountCents, payment.currency)}
            </span>
          </div>
          <div className="ss-tip-actions">
            <button
              type="button"
              className="ss-btn ss-btn-ghost"
              onClick={closeRefundPicker}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ss-btn ss-btn-primary"
              onClick={refund}
              disabled={submitting || !refundAmountValid}
            >
              {submitting
                ? "Refunding…"
                : `Refund ${formatPriceExact(refundAmountCents, payment.currency)}`}
            </button>
          </div>
        </div>
      )}

      {errorMsg && <div className="ss-form-error">{errorMsg}</div>}
    </div>
  );
}

const REFUND_PRESETS: ReadonlyArray<{
  key: RefundPresetKey;
  label: string;
}> = [
  { key: "half", label: "50%" },
  { key: "full", label: "100%" },
  { key: "tip", label: "Just tip" },
];

type RefundPresetKey = "half" | "full" | "tip";

// Stripe doesn't track which portion of a refund was "tip" vs "service",
// so "Just tip" is a UX shortcut for the captured tip amount, capped by
// what's actually still refundable. Both branches round to whole cents —
// Stripe rejects fractional cents.
function refundPresetCents(
  key: RefundPresetKey,
  payment: SchedulePayment,
  remainingCents: number,
): number {
  if (remainingCents <= 0) return 0;
  if (key === "full") return remainingCents;
  if (key === "half") return Math.round(remainingCents / 2);
  return Math.min(payment.tipCents, remainingCents);
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

// Refund flow shows cents whenever they're non-zero — operators picking a
// partial amount need exactness, but whole-dollar presets stay clean.
function formatPriceExact(cents: number, currency: string): string {
  const showCents = cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
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

// "Recurring · every 4 weeks · 5 of 6" / "ongoing" / "completed".
function seriesSummaryLine(
  series: ScheduleSeriesSummary,
  seriesIndex: number,
): string {
  const cadence = `every ${cadenceLabel(series.everyNWeeks)}`;
  const progress =
    series.status === "CANCELLED"
      ? "ended"
      : series.stopAfterVisits === null
        ? "ongoing"
        : `${seriesIndex} of ${series.stopAfterVisits}`;
  return `Recurring · ${cadence} · ${progress}`;
}

function cadenceLabel(everyNWeeks: number): string {
  if (everyNWeeks === 1) return "week";
  return `${everyNWeeks} weeks`;
}

// Show the ending-soon banner on the last 1-2 occurrences of a finite
// series. Includes COMPLETED — a finite series flips to COMPLETED as soon
// as its cap is fully materialized, but the occurrences themselves are
// still in the future and the banner is the only in-UI recovery path
// (extend / convert to indefinite). Only CANCELLED is excluded; once a
// series is cancelled there's nothing to extend.
function shouldShowEndingBanner(
  series: ScheduleSeriesSummary,
  seriesIndex: number,
): boolean {
  if (series.status === "CANCELLED") return false;
  if (series.stopAfterVisits === null) return false;
  return seriesIndex >= series.stopAfterVisits - 1;
}

function SeriesEndingSoonBanner({
  seriesId,
  seriesIndex,
  stopAfterVisits,
  isPending,
  onAction,
}: {
  seriesId: string;
  seriesIndex: number;
  stopAfterVisits: number;
  isPending: boolean;
  onAction: (
    run: () => Promise<{ ok: boolean; message?: string }>,
  ) => void;
}) {
  const isLast = seriesIndex === stopAfterVisits;
  const headline = isLast
    ? "Last visit in this series."
    : `Second-to-last visit (${seriesIndex} of ${stopAfterVisits}).`;
  return (
    <div className="ss-detail-section ss-series-end-banner" role="status">
      <div className="ss-series-end-banner-head">
        <span className="ss-detail-recur-glyph" aria-hidden>↻</span>
        <strong>{headline}</strong>
      </div>
      <p className="ss-series-end-banner-body">
        Don&apos;t lose this regular. Add more visits or switch to indefinite
        so it never runs out.
      </p>
      <div className="ss-series-end-banner-actions">
        <button
          type="button"
          className="ss-btn ss-btn-ghost"
          disabled={isPending}
          onClick={() =>
            onAction(() =>
              extendSeriesAction({ seriesId, additionalVisits: 6 }),
            )
          }
        >
          Extend by 6 more
        </button>
        <button
          type="button"
          className="ss-btn ss-btn-primary"
          disabled={isPending}
          onClick={() =>
            onAction(() =>
              convertSeriesToIndefiniteAction({ seriesId }),
            )
          }
        >
          Switch to indefinite
        </button>
      </div>
    </div>
  );
}
