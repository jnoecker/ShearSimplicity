"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, FormError } from "@/components/form";
import type { FormState } from "../_actions";

export interface ServiceOption {
  id: string;
  name: string;
  isActive: boolean;
  category: { id: string; name: string } | null;
}

export function StaffServicesForm({
  action,
  services,
  initialIds,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  services: ServiceOption[];
  initialIds: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialIds),
  );

  const groups = useMemo(() => groupByCategory(services), [services]);
  const ids = useMemo(() => Array.from(selected), [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allActiveIds = useMemo(
    () => services.filter((s) => s.isActive).map((s) => s.id),
    [services],
  );
  const selectAll = () => setSelected(new Set(allActiveIds));
  const clearAll = () => setSelected(new Set());

  return (
    <form action={formAction} className="ss-form">
      <FormError message={state?.errors?._ ?? state?.errors?.serviceIds} />
      {state?.message && !state.errors && (
        <div className="ss-form-success">{state.message}</div>
      )}
      <input type="hidden" name="serviceIds" value={JSON.stringify(ids)} />

      <div className="ss-svc-checklist-actions">
        <button
          type="button"
          onClick={selectAll}
          className="ss-btn ss-btn-ghost ss-btn-tiny"
        >
          Select all active
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="ss-btn ss-btn-ghost ss-btn-tiny"
        >
          Clear
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="ss-empty">No services to assign yet.</p>
      ) : (
        groups.map((g) => (
          <fieldset key={g.key} className="ss-svc-checklist">
            <legend>{g.name}</legend>
            <div className="ss-svc-checklist-grid">
              {g.services.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <label key={s.id} className="ss-svc-checklist-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      disabled={pending}
                    />
                    <span>
                      {s.name}
                      {!s.isActive && (
                        <em className="ss-svc-inactive-tag"> (inactive)</em>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))
      )}

      <div className="ss-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save services"}
        </Button>
      </div>
    </form>
  );
}

function groupByCategory(services: ServiceOption[]): Array<{
  key: string;
  name: string;
  services: ServiceOption[];
}> {
  const map = new Map<string, { name: string; services: ServiceOption[] }>();
  const uncatKey = "__uncat__";
  for (const s of services) {
    const key = s.category?.id ?? uncatKey;
    const name = s.category?.name ?? "Uncategorized";
    const g = map.get(key) ?? { name, services: [] };
    g.services.push(s);
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.services.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => {
      // Uncategorized last.
      if (a.key === uncatKey) return 1;
      if (b.key === uncatKey) return -1;
      return a.name.localeCompare(b.name);
    });
}
