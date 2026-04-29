"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, FormError } from "@/components/form";
import type { FormState } from "../_actions";

interface Window {
  dayOfWeek: number;
  startMinutesFromMidnight: number;
  endMinutesFromMidnight: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WorkingHoursForm({
  action,
  initial,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: Window[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );

  // Group by day so the editor is row-per-day.
  const initialByDay = useMemo(() => groupByDay(initial), [initial]);
  const [byDay, setByDay] = useState<Record<number, Window[]>>(initialByDay);

  const allWindows = useMemo<Window[]>(
    () => Object.values(byDay).flat(),
    [byDay],
  );

  return (
    <form action={formAction} className="ss-form">
      <FormError message={state?.errors?._ ?? state?.errors?.windows} />
      {state?.message && !state.errors && (
        <div className="ss-form-success">{state.message}</div>
      )}
      <input type="hidden" name="windows" value={JSON.stringify(allWindows)} />
      <div className="ss-hours-grid">
        {DAY_LABELS.map((label, day) => (
          <DayRow
            key={day}
            label={label}
            day={day}
            windows={byDay[day] ?? []}
            onAdd={() =>
              setByDay((prev) => ({
                ...prev,
                [day]: [
                  ...(prev[day] ?? []),
                  // 9:00 → 17:00 default — receptionist-friendly placeholder.
                  {
                    dayOfWeek: day,
                    startMinutesFromMidnight: 9 * 60,
                    endMinutesFromMidnight: 17 * 60,
                  },
                ],
              }))
            }
            onChange={(idx, w) =>
              setByDay((prev) => ({
                ...prev,
                [day]: (prev[day] ?? []).map((existing, i) =>
                  i === idx ? w : existing,
                ),
              }))
            }
            onRemove={(idx) =>
              setByDay((prev) => ({
                ...prev,
                [day]: (prev[day] ?? []).filter((_, i) => i !== idx),
              }))
            }
          />
        ))}
      </div>
      <div className="ss-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save working hours"}
        </Button>
      </div>
    </form>
  );
}

function DayRow({
  label,
  day,
  windows,
  onAdd,
  onChange,
  onRemove,
}: {
  label: string;
  day: number;
  windows: Window[];
  onAdd: () => void;
  onChange: (idx: number, w: Window) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="ss-hours-row">
      <div className="ss-hours-label">{label}</div>
      <div className="ss-hours-windows">
        {windows.length === 0 && <div className="ss-hours-closed">Closed</div>}
        {windows.map((w, idx) => (
          <div key={idx} className="ss-hours-window">
            <input
              type="time"
              value={minutesToHHMM(w.startMinutesFromMidnight)}
              onChange={(e) =>
                onChange(idx, {
                  ...w,
                  dayOfWeek: day,
                  startMinutesFromMidnight: hhmmToMinutes(e.target.value),
                })
              }
              className="ss-hours-input"
            />
            <span className="ss-hours-sep">to</span>
            <input
              type="time"
              value={minutesToHHMM(w.endMinutesFromMidnight)}
              onChange={(e) =>
                onChange(idx, {
                  ...w,
                  dayOfWeek: day,
                  endMinutesFromMidnight: hhmmToMinutes(e.target.value),
                })
              }
              className="ss-hours-input"
            />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="ss-btn ss-btn-ghost ss-btn-tiny"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="ss-btn ss-btn-ghost ss-btn-tiny">
        + window
      </button>
    </div>
  );
}

function groupByDay(windows: Window[]): Record<number, Window[]> {
  const out: Record<number, Window[]> = {};
  for (const w of windows) {
    (out[w.dayOfWeek] ??= []).push(w);
  }
  return out;
}

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map((p) => parseInt(p, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}
