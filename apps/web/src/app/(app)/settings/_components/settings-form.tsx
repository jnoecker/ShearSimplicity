"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/form";
import { updateSettingsAction, type FormState } from "../_actions";

// A short whitelist for the picker — can grow later. Users with a salon in an
// unusual TZ can still PATCH directly via API.
const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
];

export function SettingsForm({
  defaults,
}: {
  defaults: { name: string; timezone: string; slug: string };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateSettingsAction,
    {},
  );
  const errors = state?.errors ?? {};
  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state?.message} />
      {state?.message && !state.errors && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      <Field label="Salon name" name="name" error={errors.name}>
        <Input
          id="name"
          name="name"
          defaultValue={defaults.name}
          maxLength={120}
        />
      </Field>
      <Field
        label="Salon URL slug"
        name="slug"
        hint="Edit slugs from the org switcher (Phase 1.5). Read-only here."
      >
        <Input id="slug" defaultValue={defaults.slug} disabled />
      </Field>
      <Field
        label="Timezone"
        name="timezone"
        error={errors.timezone}
        hint="Times on the schedule render in this zone."
      >
        <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
          {!TIMEZONE_OPTIONS.includes(defaults.timezone) && (
            <option value={defaults.timezone}>{defaults.timezone}</option>
          )}
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
