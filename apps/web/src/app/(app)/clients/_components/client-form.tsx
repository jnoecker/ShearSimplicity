"use client";

import { useActionState } from "react";
import {
  Button,
  Field,
  FormError,
  Input,
  Textarea,
} from "@/components/form";
import type { FormState } from "../_actions";

export interface ClientDefaults {
  firstName?: string;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export function ClientForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: ClientDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const errors = state?.errors ?? {};
  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state?.message} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name" name="firstName" error={errors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={defaults?.firstName ?? ""}
            maxLength={80}
          />
        </Field>
        <Field label="Last name" name="lastName" error={errors.lastName}>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={defaults?.lastName ?? ""}
            maxLength={80}
          />
        </Field>
      </div>
      <Field
        label="Display name"
        name="displayName"
        error={errors.displayName}
        hint="Defaults to First Last when blank."
      >
        <Input
          id="displayName"
          name="displayName"
          defaultValue={defaults?.displayName ?? ""}
          maxLength={160}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone" name="phone" error={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaults?.phone ?? ""}
            maxLength={32}
          />
        </Field>
        <Field label="Email" name="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ""}
            maxLength={254}
          />
        </Field>
      </div>
      <Field label="Notes" name="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaults?.notes ?? ""}
          maxLength={4000}
        />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
