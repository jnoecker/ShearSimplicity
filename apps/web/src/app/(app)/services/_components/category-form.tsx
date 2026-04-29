"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/form";
import type { FormState } from "../_actions";

export function CategoryCreateForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const errors = state?.errors ?? {};
  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="flex-1">
        <Field label="Category name" name="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            required
            placeholder="Color, Cut, Treatment…"
            maxLength={80}
          />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Order" name="sortOrder" error={errors.sortOrder}>
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={0}
          />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {state?.message && !errors._ && (
        <span className="text-xs text-emerald-700">{state.message}</span>
      )}
      <FormError message={errors._} />
    </form>
  );
}
