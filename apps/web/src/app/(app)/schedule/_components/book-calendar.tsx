"use client";

import { useMemo, useState } from "react";
import { format as formatTz, fromZonedTime } from "date-fns-tz";
import { shiftIsoDate } from "@/lib/salon-time";
import { categoryKind, type CategoryKind } from "@/lib/service-categories";
import type {
  BookService,
  BookStaff,
} from "./book-appointment-modal";

const DOWS = ["S", "M", "T", "W", "T", "F", "S"];
const SLOT_MIN = 15;
const SLOT_HEIGHT = 12;
const SLOT_START_MIN = 9 * 60;
const SLOT_END_MIN = 19 * 60;
const TOTAL_SLOTS = (SLOT_END_MIN - SLOT_START_MIN) / SLOT_MIN;

const STAFF_GRADIENTS = [
  "linear-gradient(135deg, #1ec3d9, #0892a8)",
  "linear-gradient(135deg, #0892a8, #4a82b3)",
  "linear-gradient(135deg, #4a82b3, #1ec3d9)",
  "linear-gradient(135deg, #5cdcec, #0892a8)",
  "linear-gradient(135deg, #1ec3d9, #6fa6cc)",
];

// CategoryKind keys used in the design's color bars. We map our six kinds
// onto the bar's five segments (block falls back to neutral so it doesn't
// pollute the colored bar).
type BarKind = "color" | "cut" | "treat" | "style" | "bridal";
function barKind(k: CategoryKind): BarKind | null {
  if (k === "color" || k === "cut" || k === "treat" || k === "bridal") return k;
  if (k === "styling") return "style";
  return null;
}

export interface BookCalendarAppointment {
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
  client: { id: string; displayName: string };
  staffMember: { id: string; displayName: string };
  services: { serviceId: string; serviceNameSnapshot: string }[];
}

interface Props {
  timezone: string;
  /** YYYY-MM-DD currently selected. */
  selectedDate: string;
  /** YYYY-MM-DD highlighted as "today" in the salon's tz. */
  todayIso: string;
  /** Minutes-from-midnight currently chosen, or null if none yet. */
  selectedMinutes: number | null;
  /** YYYY-MM viewed in month mode. */
  viewMonth: string;
  /** "next" / "prev" month iso for nav links. */
  prevMonthIso: string;
  nextMonthIso: string;
  /** Appointments overlapping the visible month — already filtered to
   *  active statuses by the caller. */
  monthAppointments: BookCalendarAppointment[];
  staff: BookStaff[];
  /** Currently picked stylist (when set, day view shows just that column). */
  selectedStaffId: string | null;
  /** Service catalog so we can color-code by category. */
  services: BookService[];
  /** Sum of selected service durations — used to gate which slots are open. */
  selectedDurationMin: number;
  /** Set salon-local date (YYYY-MM-DD); transitions to day mode. */
  onSelectDate: (iso: string) => void;
  /** Pick (date, minutes, optional staffId) by clicking an open slot. */
  onPickSlot: (iso: string, minutes: number, staffId: string) => void;
  /** Navigate to a different month (does not change the selected date). */
  onMonthChange: (yearMonth: string) => void;
  onSelectStaff?: (staffId: string) => void;
}

export function BookCalendar({
  timezone,
  selectedDate,
  todayIso,
  selectedMinutes,
  viewMonth,
  prevMonthIso,
  nextMonthIso,
  monthAppointments,
  staff,
  selectedStaffId,
  services,
  selectedDurationMin,
  onSelectDate,
  onPickSlot,
  onMonthChange,
  onSelectStaff,
}: Props) {
  const [mode, setMode] = useState<"month" | "day">("month");

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

  // Group appointments by salon-local date so the month grid can render
  // per-cell mixes without re-walking the whole list each cell.
  const apptsByDate = useMemo(() => {
    const m = new Map<string, BookCalendarAppointment[]>();
    for (const a of monthAppointments) {
      const localDate = formatTz(new Date(a.startAt), "yyyy-MM-dd", {
        timeZone: timezone,
      });
      const list = m.get(localDate) ?? [];
      list.push(a);
      m.set(localDate, list);
    }
    return m;
  }, [monthAppointments, timezone]);

  const selectedDayAppts = useMemo(
    () => apptsByDate.get(selectedDate) ?? [],
    [apptsByDate, selectedDate],
  );

  const monthCells = useMemo(
    () => buildMonthCells(viewMonth, todayIso, selectedDate, apptsByDate, kindForServiceId),
    [viewMonth, todayIso, selectedDate, apptsByDate, kindForServiceId],
  );

  // 7-day window centered on the selected date (Sunday-anchored in salon tz).
  const weekDays = useMemo(
    () => buildWeekDays(selectedDate, timezone, apptsByDate, kindForServiceId, todayIso),
    [selectedDate, timezone, apptsByDate, kindForServiceId, todayIso],
  );

  const dateLabel = formatDateLabel(selectedDate, timezone);
  const monthLabel = formatTz(
    fromZonedTime(`${viewMonth}-01T12:00:00`, timezone),
    "MMMM yyyy",
    { timeZone: timezone },
  );

  function handlePickDate(iso: string) {
    onSelectDate(iso);
    setMode("day");
  }

  return (
    <div className="bk-calendar">
      {mode === "day" && (
        <div className="bk-cal-crumbs">
          <button
            type="button"
            className="bk-cal-back"
            onClick={() => setMode("month")}
          >
            <span aria-hidden>←</span>
            <span>{monthLabel}</span>
          </button>
          <span className="bk-cal-crumb-sep">/</span>
          <span className="bk-cal-crumb-current">{dateLabel}</span>
          <button
            type="button"
            className="bk-cal-month-link"
            onClick={() => setMode("month")}
          >
            View month
          </button>
        </div>
      )}

      {mode === "month" ? (
        <BookMonthGrid
          cells={monthCells}
          monthLabel={monthLabel}
          prevMonthIso={prevMonthIso}
          nextMonthIso={nextMonthIso}
          onPick={handlePickDate}
          onMonthChange={onMonthChange}
        />
      ) : (
        <>
          <BookWeekStrip
            days={weekDays}
            onPick={(iso) => onSelectDate(iso)}
          />
          <BookDayView
            timezone={timezone}
            selectedDate={selectedDate}
            selectedMinutes={selectedMinutes}
            selectedDurationMin={selectedDurationMin}
            dateLabel={dateLabel}
            staff={staff}
            selectedStaffId={selectedStaffId}
            appointments={selectedDayAppts}
            kindForServiceId={kindForServiceId}
            onPickSlot={(minutes, staffId) =>
              onPickSlot(selectedDate, minutes, staffId)
            }
            onSelectStaff={onSelectStaff}
          />
        </>
      )}
    </div>
  );
}

interface MonthCell {
  iso: string;
  day: number;
  out: boolean;
  today: boolean;
  selected: boolean;
  mix: Partial<Record<BarKind, number>>;
}

function buildMonthCells(
  viewMonth: string,
  todayIso: string,
  selectedDate: string,
  apptsByDate: Map<string, BookCalendarAppointment[]>,
  kindForServiceId: Map<string, CategoryKind>,
): MonthCell[] {
  // viewMonth is "YYYY-MM". Compute the calendar grid (always 6 rows × 7 cols
  // to keep layout stable as months change shape).
  const [yearStr, monthStr] = viewMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0 = Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - startDow;
    const date = new Date(Date.UTC(year, month - 1, 1 + offset));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const out = m !== month;
    const appts = apptsByDate.get(iso) ?? [];
    const mix: Partial<Record<BarKind, number>> = {};
    for (const a of appts) {
      const kind =
        a.services
          .map((s) => kindForServiceId.get(s.serviceId))
          .find((k): k is CategoryKind => Boolean(k)) ?? "cut";
      const bk = barKind(kind);
      if (bk) mix[bk] = (mix[bk] ?? 0) + 1;
    }
    cells.push({
      iso,
      day: d,
      out,
      today: !out && iso === todayIso,
      selected: !out && iso === selectedDate,
      mix,
    });
    // Stop after we've covered the last week containing the month's last day.
    if (offset >= daysInMonth + (6 - ((startDow + daysInMonth - 1) % 7))) break;
  }
  return cells;
}

function BookMonthGrid({
  cells,
  monthLabel,
  prevMonthIso,
  nextMonthIso,
  onPick,
  onMonthChange,
}: {
  cells: MonthCell[];
  monthLabel: string;
  prevMonthIso: string;
  nextMonthIso: string;
  onPick: (iso: string) => void;
  onMonthChange: (yearMonth: string) => void;
}) {
  return (
    <div className="bk-month">
      <div className="bk-month-head">
        <button
          type="button"
          className="bk-cal-nav"
          onClick={() => onMonthChange(prevMonthIso)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="bk-cal-month">{monthLabel}</div>
        <button
          type="button"
          className="bk-cal-nav"
          onClick={() => onMonthChange(nextMonthIso)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="bk-month-dows">
        {DOWS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="bk-month-grid">
        {cells.map((c) => {
          const total = Object.values(c.mix).reduce((a, b) => a + (b ?? 0), 0);
          const closed = !c.out && total === 0;
          const cls = [
            "bk-month-cell",
            c.out && "is-out",
            c.today && "is-today",
            c.selected && "is-selected",
            // Don't paint the hatched "closed" pattern — every day is bookable.
          ]
            .filter(Boolean)
            .join(" ");
          void closed;
          return (
            <button
              key={c.iso}
              type="button"
              className={cls}
              disabled={c.out}
              onClick={() => !c.out && onPick(c.iso)}
            >
              <span className="bk-month-num">{c.day}</span>
              {!c.out && total > 0 && (
                <span className="bk-month-bar" aria-hidden>
                  {(["color", "cut", "treat", "style", "bridal"] as BarKind[]).map(
                    (k) => {
                      const v = c.mix[k];
                      if (!v) return null;
                      return (
                        <span
                          key={k}
                          className={`bk-month-seg is-${k}`}
                          style={{ flex: v }}
                        />
                      );
                    },
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="bk-month-legend">
        <span>
          <i className="bk-month-sw is-color" /> Color
        </span>
        <span>
          <i className="bk-month-sw is-cut" /> Cut
        </span>
        <span>
          <i className="bk-month-sw is-treat" /> Treatment
        </span>
        <span>
          <i className="bk-month-sw is-style" /> Styling
        </span>
        <span>
          <i className="bk-month-sw is-bridal" /> Bridal
        </span>
      </div>
    </div>
  );
}

interface WeekDay {
  iso: string;
  day: number;
  dow: string;
  selected: boolean;
  today: boolean;
  monthLabel: string | null;
  mix: Partial<Record<BarKind, number>>;
}

function buildWeekDays(
  selectedDate: string,
  timezone: string,
  apptsByDate: Map<string, BookCalendarAppointment[]>,
  kindForServiceId: Map<string, CategoryKind>,
  todayIso: string,
): WeekDay[] {
  // Anchor at the Sunday on or before the selected date in salon tz.
  const sel = fromZonedTime(`${selectedDate}T12:00:00`, timezone);
  const dow = Number(formatTz(sel, "i", { timeZone: timezone })); // 1-7 Mon-Sun
  // ISO 1..7: 1=Mon ... 7=Sun. We want Sunday-start.
  const offsetToSunday = dow === 7 ? 0 : -dow;
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = shiftIsoDate(selectedDate, offsetToSunday + i, timezone);
    const appts = apptsByDate.get(iso) ?? [];
    const mix: Partial<Record<BarKind, number>> = {};
    for (const a of appts) {
      const kind =
        a.services
          .map((s) => kindForServiceId.get(s.serviceId))
          .find((k): k is CategoryKind => Boolean(k)) ?? "cut";
      const bk = barKind(kind);
      if (bk) mix[bk] = (mix[bk] ?? 0) + 1;
    }
    const d = fromZonedTime(`${iso}T12:00:00`, timezone);
    const day = Number(formatTz(d, "d", { timeZone: timezone }));
    const dowLabel = formatTz(d, "EEE", { timeZone: timezone });
    // Show a "May" eyebrow on the first day of a new month within the strip.
    const monthLabel =
      day === 1 ? formatTz(d, "MMM", { timeZone: timezone }) : null;
    out.push({
      iso,
      day,
      dow: dowLabel,
      selected: iso === selectedDate,
      today: iso === todayIso,
      monthLabel,
      mix,
    });
  }
  return out;
}

function BookWeekStrip({
  days,
  onPick,
}: {
  days: WeekDay[];
  onPick: (iso: string) => void;
}) {
  return (
    <div className="bk-weekstrip">
      {days.map((d) => {
        const cls = [
          "bk-weekstrip-day",
          d.selected && "is-selected",
          d.today && "is-today",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={d.iso}
            type="button"
            className={cls}
            onClick={() => onPick(d.iso)}
          >
            <span className="bk-weekstrip-dow">{d.dow}</span>
            <span className="bk-weekstrip-num">
              {d.monthLabel && <em>{d.monthLabel} </em>}
              {d.day}
            </span>
            <span className="bk-weekstrip-bar" aria-hidden>
              {(["color", "cut", "treat", "style", "bridal"] as BarKind[]).map(
                (k) => {
                  const v = d.mix[k];
                  if (!v) return null;
                  return (
                    <span
                      key={k}
                      className={`bk-month-seg is-${k}`}
                      style={{ flex: v }}
                    />
                  );
                },
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BookDayView({
  timezone,
  selectedDate,
  selectedMinutes,
  selectedDurationMin,
  dateLabel,
  staff,
  selectedStaffId,
  appointments,
  kindForServiceId,
  onPickSlot,
  onSelectStaff,
}: {
  timezone: string;
  selectedDate: string;
  selectedMinutes: number | null;
  selectedDurationMin: number;
  dateLabel: string;
  staff: BookStaff[];
  selectedStaffId: string | null;
  appointments: BookCalendarAppointment[];
  kindForServiceId: Map<string, CategoryKind>;
  onPickSlot: (minutes: number, staffId: string) => void;
  onSelectStaff?: (staffId: string) => void;
}) {
  const visibleStaff = selectedStaffId
    ? staff.filter((s) => s.id === selectedStaffId)
    : staff;
  // Build a per-stylist occupancy map keyed by slot index. A slot is
  // "occupied" if it falls inside any active appointment for that stylist.
  // Computing once per render is cheap (4 staff × 40 slots).
  const occupancy = useMemo(
    () => buildOccupancy(appointments, visibleStaff, timezone),
    [appointments, visibleStaff, timezone],
  );
  const requiredSlots = Math.max(1, Math.ceil(selectedDurationMin / SLOT_MIN));

  return (
    <div
      className="bk-day"
      style={{ ["--bk-slot-h" as string]: `${SLOT_HEIGHT}px` } as React.CSSProperties}
    >
      <div className="bk-day-head">
        <div className="bk-day-title">
          <strong>{dateLabel}</strong>
          <span className="bk-day-sub">
            {selectedStaffId
              ? `with ${staff.find((s) => s.id === selectedStaffId)?.displayName ?? "—"}`
              : "All stylists — pick any open slot"}
          </span>
        </div>
        <div className="bk-day-legend">
          <span>
            <i className="bk-month-sw is-color" /> Color
          </span>
          <span>
            <i className="bk-month-sw is-cut" /> Cut
          </span>
          <span>
            <i className="bk-month-sw is-treat" /> Treat
          </span>
          <span>
            <i className="bk-month-sw is-style" /> Style
          </span>
          <span>
            <i className="bk-month-sw is-bridal" /> Bridal
          </span>
        </div>
      </div>
      <div
        className="bk-day-grid"
        style={{
          gridTemplateColumns: `44px repeat(${visibleStaff.length}, 1fr)`,
        }}
      >
        <div className="bk-day-h-spacer" />
        {visibleStaff.map((s, i) => (
          <div
            key={s.id}
            className="bk-day-h"
            style={
              {
                ["--bk-stylist-tint" as string]: s.color
                  ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                  : STAFF_GRADIENTS[i % STAFF_GRADIENTS.length],
              } as React.CSSProperties
            }
          >
            <span
              className="bk-day-h-avatar"
              style={{
                background: s.color
                  ? `linear-gradient(135deg, ${s.color}, ${s.color})`
                  : STAFF_GRADIENTS[i % STAFF_GRADIENTS.length],
              }}
            >
              {initialsOf(s.displayName)}
            </span>
            <span className="bk-day-h-name">
              {s.displayName.split(" ")[0]}
            </span>
          </div>
        ))}

        <div
          className="bk-day-times"
          style={{ gridRow: `2 / span ${TOTAL_SLOTS}` }}
        >
          {Array.from({ length: (SLOT_END_MIN - SLOT_START_MIN) / 60 }).map(
            (_, i) => {
              const m = SLOT_START_MIN + i * 60;
              return (
                <div
                  key={i}
                  className="bk-day-time"
                  style={{ height: SLOT_HEIGHT * 4 }}
                >
                  {minutesLabel(m)}
                </div>
              );
            },
          )}
        </div>

        {visibleStaff.map((s, ci) => {
          const occ = occupancy[ci] ?? [];
          return (
            <div
              key={s.id}
              className="bk-day-col"
              style={{
                gridRow: `2 / span ${TOTAL_SLOTS}`,
                height: SLOT_HEIGHT * TOTAL_SLOTS,
              }}
            >
              {Array.from({ length: (SLOT_END_MIN - SLOT_START_MIN) / 60 }).map(
                (_, hi) => (
                  <div
                    key={`h${hi}`}
                    className="bk-day-hour-line"
                    style={{ top: hi * SLOT_HEIGHT * 4 }}
                  />
                ),
              )}
              {Array.from({ length: (SLOT_END_MIN - SLOT_START_MIN) / 60 }).map(
                (_, hi) => (
                  <div
                    key={`hh${hi}`}
                    className="bk-day-half-line"
                    style={{ top: hi * SLOT_HEIGHT * 4 + SLOT_HEIGHT * 2 }}
                  />
                ),
              )}

              {/* Open slots — one button per quarter-hour slot, sized to a
                  single slot so click targets don't overlap. We still gate
                  by "fits the duration" so we never offer a slot the
                  appointment can't actually fit into.
                  The earlier rendering made each button `requiredSlots`
                  rows tall, which stacked them up to 6 deep on a 90-min
                  service — clicks were dispatched to whichever button
                  happened to be last in DOM order at that y-coord, so
                  picking "1:00" often booked 1:15 / 1:30 / etc. */}
              {Array.from({ length: TOTAL_SLOTS }).map((_, slot) => {
                if (occ[slot]) return null;
                let fits = true;
                for (let k = 0; k < requiredSlots; k++) {
                  if (slot + k >= TOTAL_SLOTS || occ[slot + k]) {
                    fits = false;
                    break;
                  }
                }
                if (!fits) return null;
                const minutes = SLOT_START_MIN + slot * SLOT_MIN;
                return (
                  <button
                    key={`o${slot}`}
                    type="button"
                    className="bk-day-open"
                    style={{
                      top: slot * SLOT_HEIGHT,
                      height: SLOT_HEIGHT,
                    }}
                    aria-label={`Book ${minutesLabel(minutes)} with ${s.displayName}`}
                    onClick={() => {
                      onPickSlot(minutes, s.id);
                      if (!selectedStaffId && onSelectStaff) {
                        onSelectStaff(s.id);
                      }
                    }}
                  />
                );
              })}

              {/* Picked-slot preview — non-interactive overlay that shows
                  the appointment's full duration in this column. We paint
                  it on top of the open-slot buttons (pointer-events: none
                  so it doesn't intercept further clicks) once a slot is
                  picked for this stylist. */}
              {selectedMinutes !== null &&
                (!selectedStaffId || selectedStaffId === s.id) &&
                selectedMinutes >= SLOT_START_MIN &&
                selectedMinutes < SLOT_END_MIN && (() => {
                  const startSlot =
                    (selectedMinutes - SLOT_START_MIN) / SLOT_MIN;
                  if (occ[startSlot]) return null;
                  return (
                    <div
                      key="picked"
                      className="bk-day-pick"
                      style={{
                        top: startSlot * SLOT_HEIGHT,
                        height: requiredSlots * SLOT_HEIGHT,
                      }}
                      aria-hidden
                    >
                      <span className="bk-day-pick-label">
                        {minutesLabel(selectedMinutes)}
                      </span>
                    </div>
                  );
                })()}

              {/* Existing appointments — read-only, color-coded. */}
              {appointments
                .filter((a) => a.staffMember.id === s.id)
                .map((a) => {
                  const startMin = minutesFromIso(a.startAt, timezone);
                  const endMin = minutesFromIso(a.endAt, timezone);
                  if (
                    endMin <= SLOT_START_MIN ||
                    startMin >= SLOT_END_MIN
                  ) {
                    return null;
                  }
                  const top =
                    Math.max(0, (startMin - SLOT_START_MIN) / SLOT_MIN) *
                    SLOT_HEIGHT;
                  const height =
                    ((Math.min(endMin, SLOT_END_MIN) -
                      Math.max(startMin, SLOT_START_MIN)) /
                      SLOT_MIN) *
                      SLOT_HEIGHT -
                    1;
                  const kind =
                    a.services
                      .map((sv) => kindForServiceId.get(sv.serviceId))
                      .find((k): k is CategoryKind => Boolean(k)) ?? "cut";
                  const bk = barKind(kind) ?? "cut";
                  return (
                    <div
                      key={a.id}
                      className={`bk-day-block is-${bk}`}
                      style={{ top, height }}
                    >
                      <div className="bk-day-block-name">
                        {a.client.displayName}
                      </div>
                      <div className="bk-day-block-svc">
                        {a.services
                          .map((sv) => sv.serviceNameSnapshot)
                          .join(" · ")}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildOccupancy(
  appointments: BookCalendarAppointment[],
  staff: BookStaff[],
  timezone: string,
): boolean[][] {
  const out: boolean[][] = staff.map(() =>
    Array(TOTAL_SLOTS).fill(false) as boolean[],
  );
  for (const a of appointments) {
    if (a.status === "CANCELLED" || a.status === "NO_SHOW") continue;
    const ci = staff.findIndex((s) => s.id === a.staffMember.id);
    if (ci === -1) continue;
    const startMin = minutesFromIso(a.startAt, timezone);
    const endMin = minutesFromIso(a.endAt, timezone);
    const startSlot = Math.max(
      0,
      Math.floor((startMin - SLOT_START_MIN) / SLOT_MIN),
    );
    const endSlot = Math.min(
      TOTAL_SLOTS,
      Math.ceil((endMin - SLOT_START_MIN) / SLOT_MIN),
    );
    for (let i = startSlot; i < endSlot; i++) {
      const row = out[ci];
      if (row) row[i] = true;
    }
  }
  return out;
}

function minutesFromIso(iso: string, timezone: string): number {
  const hm = formatTz(new Date(iso), "HH:mm", { timeZone: timezone });
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function minutesLabel(m: number): string {
  const h = Math.floor(m / 60);
  const meridiem = h < 12 ? "AM" : "PM";
  const display = ((h + 11) % 12) + 1;
  return `${display} ${meridiem}`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function formatDateLabel(iso: string, timezone: string): string {
  const d = fromZonedTime(`${iso}T12:00:00`, timezone);
  return formatTz(d, "EEEE, MMMM d", { timeZone: timezone });
}

