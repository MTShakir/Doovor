'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nameHalves } from '@repo/core/person-name';
import { accountNameSchema } from '@repo/core/schemas/account';
import type { z } from '@repo/core/zod';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveAccountName } from '../actions';

/**
 * The name on the account, in two halves (D-196, D-217), and what an instructor's own Business is
 * called. The name learners see is a separate thing and stays on the profile, because changing
 * one is not always meant to change the other.
 */
export function AccountNameForm({
  name,
  businessName,
  businessLabel = 'Your business name',
  teaches,
}: {
  name: string;
  /** What their own Business is called. Absent for somebody who cannot rename one. */
  businessName?: string;
  /** A school's name is called a school's name. */
  businessLabel?: string;
  /** They teach, so the name learners see lives somewhere else and is worth pointing at. */
  teaches: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // No default values: the field keeps anything typed before hydration (ClientForm, D-043).
  const form = useForm<z.input<typeof accountNameSchema>>({ resolver: zodResolver(accountNameSchema) });
  const halves = nameHalves(name);

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveAccountName(values);
      if (!result.ok) {
        setFormError(result.fields ? null : result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof z.input<typeof accountNameSchema>, { message });
        }
        return;
      }
      toast('Saved');
      router.push('/account');
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="First name" error={form.formState.errors.firstName?.message}>
        <Input autoComplete="given-name" defaultValue={halves.firstName} {...form.register('firstName')} />
      </Field>
      <Field label="Last name" error={form.formState.errors.lastName?.message}>
        <Input autoComplete="family-name" defaultValue={halves.lastName} {...form.register('lastName')} />
      </Field>
      {businessName === undefined ? null : (
        <Field label={businessLabel} hint="Shown on your public profile and on receipts." error={form.formState.errors.businessName?.message}>
          <Input autoComplete="organization" defaultValue={businessName} {...form.register('businessName')} />
        </Field>
      )}
      {teaches ? (
        <p className="text-small text-grey-700">
          This is the name on your account. The name learners see is your display name, on{' '}
          <Link href="/app/instructor/profile" className="font-semibold text-black underline underline-offset-4">
            your profile
          </Link>
          .
        </p>
      ) : null}
      <SubmitButton width="full" size="lg" pending={pending}>
        Save name
      </SubmitButton>
    </ClientForm>
  );
}
