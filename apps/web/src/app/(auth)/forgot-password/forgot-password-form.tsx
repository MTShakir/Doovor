'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { magicLinkSchema } from '@repo/core/schemas/auth';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { requestPasswordReset } from '../actions';

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof magicLinkSchema>>({ resolver: zodResolver(magicLinkSchema) });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (!result.ok) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Send reset link
      </SubmitButton>
    </ClientForm>
  );
}
