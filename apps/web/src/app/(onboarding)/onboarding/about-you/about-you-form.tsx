'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { experienceLevels, learnerOnboardingSchema, learnerTransmissions } from '@repo/core/schemas/learner';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveLearnerProfile } from './actions';

type Values = z.input<typeof learnerOnboardingSchema>;

export function AboutYouForm({ initialName }: { initialName: string }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // No default values on the text fields: they keep anything typed before hydration (D-043).
  const form = useForm<Values>({ resolver: zodResolver(learnerOnboardingSchema) });
  // What would help is asked only of somebody who says there is something (D-180).
  const told = useWatch({ control: form.control, name: 'hasDisability' });
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
      {/* Health is the learner's to tell or keep (D-180): asked here, answered only if they want to. */}
      <Field
        label="Do you have a disability, condition or learning difficulty?"
        hint="You do not have to answer. It helps your instructor plan lessons that suit you, and it is never used to decide whether you can learn with us."
        error={errors.hasDisability?.message}
      >
        <Select
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
          placeholder="Rather not say"
          {...form.register('hasDisability')}
        />
      </Field>
      {told === 'yes' ? (
        <Field
          label="What would help?"
          hint="Only your instructor and the school you learn with see this."
          error={errors.disabilityDetails?.message}
        >
          <Textarea maxLength={1000} {...form.register('disabilityDetails')} />
        </Field>
      ) : null}
      <SubmitButton width="full" size="lg" pending={pending}>
        Finish
      </SubmitButton>
    </ClientForm>
  );
}
