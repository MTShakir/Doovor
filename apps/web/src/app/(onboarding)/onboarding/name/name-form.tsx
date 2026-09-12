'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { onboardingNameSchema } from '@repo/core/schemas/onboarding';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveName } from '../../actions';

export function NameForm({ initialName }: { initialName: string }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // No default values: the field keeps anything typed before hydration (ClientForm, D-043).
  const form = useForm<z.input<typeof onboardingNameSchema>>({ resolver: zodResolver(onboardingNameSchema) });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // Saving redirects, so this only resolves when something needs fixing.
      const result = await saveName(values);
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof z.input<typeof onboardingNameSchema>, { message });
        }
      }
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field
        label="Your name"
        hint="Learners see this on your profile and in messages."
        error={form.formState.errors.fullName?.message}
      >
        <Input autoComplete="name" defaultValue={initialName} {...form.register('fullName')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
