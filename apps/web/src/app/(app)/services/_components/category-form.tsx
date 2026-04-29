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
    <form action={formAction} className="ss-form">
      <div className="ss-form-row">
        <Field label="Category name" name="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            required
            placeholder="Color, Cut, Treatment…"
            maxLength={80}
          />
        </Field>
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
      <div className="ss-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add category"}
        </Button>
        {state?.message && !errors._ && (
          <span className="ss-form-success-inline">{state.message}</span>
        )}
        <FormError message={errors._} />
      </div>
    </form>
  );
}
