'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { experienceLevels, learnerOnboardingSchema, learnerTransmissions } from '@repo/core/schemas/learner';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveLearnerProfile } from './actions';

type Values = z.input<typeof learnerOnboardingSchema>;

export function AboutYouForm({ initialName }: { initialName: string }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // No default values on the text fields: they keep anything typed before hydration (D-043).
  const form = useForm<Values>({ resolver: zodResolver(learnerOnboardingSchema) });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // Saving redirects, so this only resolves when something needs fixing.
      const result = await saveLearnerProfile(values);
      if (!result.ok) {
        setFormError(result.fields ? null : result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof Values, { message });
        }
      }
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Your name" hint="Your instructor sees this." error={errors.fullName?.message}>
        <Input autoComplete="name" defaultValue={initialName} {...form.register('fullName')} />
      </Field>
      <Field
        label="Your postcode"
        hint="We use it to find instructors near you."
        error={errors.postcode?.message}
      >
        <Input
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="uppercase"
          {...form.register('postcode')}
        />
      </Field>
      <Field label="Which gearbox?" error={errors.transmission?.message}>
        <Select options={[...learnerTransmissions]} placeholder="Choose one" {...form.register('transmission')} />
      </Field>
      <Field label="How far along are you?" error={errors.experienceLevel?.message}>
        <Select options={[...experienceLevels]} placeholder="Choose one" {...form.register('experienceLevel')} />
      </Field>
      <Field
        label="Date of birth"
        hint="You have to be 16 to learn. Your instructor never sees this date."
        error={errors.dateOfBirth?.message}
      >
        <Input type="date" autoComplete="bday" {...form.register('dateOfBirth')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Finish
      </SubmitButton>
    </ClientForm>
  );
}
