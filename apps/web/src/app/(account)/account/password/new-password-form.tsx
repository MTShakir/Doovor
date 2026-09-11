'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { newPasswordSchema } from '@repo/core/schemas/auth';
import { Field } from '@repo/ui/field';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { PasswordInput } from '@/components/password-input';
import { updatePassword } from '../../../(auth)/actions';

export function NewPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (!result.ok) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="New password" hint="At least 8 characters." error={form.formState.errors.password?.message}>
        <PasswordInput autoComplete="new-password" {...form.register('password')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Save password
      </SubmitButton>
    </ClientForm>
  );
}
