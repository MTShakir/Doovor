'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { FlagOverrides } from '@repo/config/flags';
import { signUpSchema, type IntendedRole } from '@repo/core/schemas/auth';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { OAuthButtons } from '@/components/oauth-buttons';
import { PasswordInput } from '@/components/password-input';
import { signUp } from '../actions';
import { track } from '@/lib/analytics/track';

const headings: Record<IntendedRole, string> = {
  learner: 'Create your learner account',
  instructor: 'Create your instructor account',
  school: 'Create your school account',
};

export interface SignUpPrefill {
  fullName: string;
  email: string;
}

export function SignUpForm({ role, prefill, flags }: { role: IntendedRole; prefill?: SignUpPrefill; flags: FlagOverrides }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    // Only the role: text fields read what is typed, even before hydration (ClientForm).
    defaultValues: { role },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    track('signup_started', { role });
    startTransition(async () => {
      const result = await signUp(values);
      if (result.ok) track('signup_completed', { role });
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof z.input<typeof signUpSchema>, { message });
        }
      }
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">{headings[role]}</h1>
        <Link href="/start" className="self-start text-small font-semibold text-blue underline underline-offset-4">
          Change account type
        </Link>
      </div>
      <OAuthButtons next={`/start?role=${role}`} flags={flags} />
      <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <Field label="Full name" error={errors.fullName?.message}>
          <Input autoComplete="name" defaultValue={prefill?.fullName} {...form.register('fullName')} />
        </Field>
        {role === 'school' ? (
          <Field label="School name" error={errors.schoolName?.message}>
            <Input autoComplete="organization" {...form.register('schoolName')} />
          </Field>
        ) : null}
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" defaultValue={prefill?.email} {...form.register('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters. A short phrase is easy to remember." error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </Field>
        <p className="text-small text-grey-700">
          By creating an account you agree to our terms and privacy notice.
        </p>
        <SubmitButton width="full" size="lg" pending={pending}>
          Create account
        </SubmitButton>
      </ClientForm>
    </div>
  );
}
