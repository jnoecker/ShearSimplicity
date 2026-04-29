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
    <form action={formAction} className="space-y-4">
      <FormError message={state?.errors?._ ?? state?.errors?.windows} />
      {state?.message && !state.errors && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      <input type="hidden" name="windows" value={JSON.stringify(allWindows)} />
      <div className="space-y-2">
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
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save working hours"}
      </Button>
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
    <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3">
      <div className="w-12 pt-2 text-sm font-medium text-zinc-700">{label}</div>
      <div className="flex-1 space-y-2">
        {windows.length === 0 && (
          <div className="text-sm text-zinc-400">Closed</div>
        )}
        {windows.map((w, idx) => (
          <div key={idx} className="flex items-center gap-2">
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
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
            <span className="text-sm text-zinc-400">to</span>
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
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="ml-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
      >
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
