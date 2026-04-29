"use client";

import { useActionState } from "react";
import {
  Button,
  Checkbox,
  Field,
  FormError,
  Input,
  Select,
  Textarea,
} from "@/components/form";
import type { FormState } from "../_actions";

export interface ServiceDefaults {
  name?: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  defaultDurationMinutes?: number;
  defaultPriceCents?: number;
  currency?: string;
  isActive?: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export function ServiceForm({
  action,
  defaults,
  categories,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: ServiceDefaults;
  categories: CategoryOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const errors = state?.errors ?? {};
  const dollars =
    defaults?.defaultPriceCents !== undefined
      ? (defaults.defaultPriceCents / 100).toFixed(2)
      : "";
  return (
    <form action={formAction} className="ss-form">
      <FormError message={state?.message} />
      <Field label="Name" name="name" error={errors.name}>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          maxLength={120}
        />
      </Field>
      <Field
        label="Slug"
        name="slug"
        error={errors.slug}
        hint="Lowercase letters, numbers, and dashes. Used in URLs and reports."
      >
        <Input
          id="slug"
          name="slug"
          required
          defaultValue={defaults?.slug ?? ""}
          maxLength={80}
          placeholder="balayage-premium"
        />
      </Field>
      <Field label="Category" name="categoryId" error={errors.categoryId}>
        <Select
          id="categoryId"
          name="categoryId"
          defaultValue={defaults?.categoryId ?? ""}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="ss-form-row">
        <Field
          label="Default duration"
          name="defaultDurationMinutes"
          error={errors.defaultDurationMinutes}
          hint="Minutes"
        >
          <Input
            id="defaultDurationMinutes"
            name="defaultDurationMinutes"
            type="number"
            required
            min={5}
            max={1440}
            defaultValue={defaults?.defaultDurationMinutes ?? 60}
          />
        </Field>
        <Field
          label="Default price"
          name="defaultPriceDollars"
          error={errors.defaultPriceCents}
          hint="Stored as cents on the server"
        >
          <Input
            id="defaultPriceDollars"
            name="defaultPriceDollars"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={dollars}
          />
        </Field>
      </div>
      <Field label="Description" name="description" error={errors.description}>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaults?.description ?? ""}
          maxLength={2000}
        />
      </Field>
      <input type="hidden" name="currency" value={defaults?.currency ?? "USD"} />
      <Checkbox
        name="isActive"
        label="Active (bookable)"
        defaultChecked={defaults?.isActive ?? true}
      />
      <div className="ss-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
