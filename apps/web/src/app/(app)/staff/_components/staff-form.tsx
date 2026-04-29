"use client";

import { useActionState } from "react";
import {
  Button,
  Field,
  FormError,
  Input,
  Textarea,
  Checkbox,
} from "@/components/form";
import type { FormState } from "../_actions";

export interface StaffDefaults {
  displayName?: string;
  title?: string | null;
  color?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

export function StaffForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: StaffDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const errors = state?.errors ?? {};
  return (
    <form action={formAction} className="ss-form">
      <FormError message={state?.message} />
      <Field label="Display name" name="displayName" error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          required
          defaultValue={defaults?.displayName ?? ""}
          maxLength={120}
          autoComplete="off"
        />
      </Field>
      <Field label="Title" name="title" error={errors.title} hint="e.g. Senior Stylist">
        <Input
          id="title"
          name="title"
          defaultValue={defaults?.title ?? ""}
          maxLength={80}
        />
      </Field>
      <Field
        label="Calendar color"
        name="color"
        error={errors.color}
        hint="6-digit hex, like #6c8eef"
      >
        <Input
          id="color"
          name="color"
          defaultValue={defaults?.color ?? ""}
          placeholder="#6c8eef"
          maxLength={7}
        />
      </Field>
      <Field label="Bio" name="bio" error={errors.bio}>
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={defaults?.bio ?? ""}
          maxLength={2000}
        />
      </Field>
      <Checkbox
        name="isActive"
        label="Active (shows on the schedule)"
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
