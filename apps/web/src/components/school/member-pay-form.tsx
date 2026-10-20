'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { memberPaySchema, payBases, type PayBasis } from '@repo/core/member-pay';
import { penceAsTyped } from '@repo/core/catalogue';
import type { Result } from '@repo/core/result';
import type { z } from '@repo/core/zod';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';

type Values = z.input<typeof memberPaySchema>;

/**
 * What the school pays an instructor teaching under it (M9-21, D-291): a rate for every hour
 * taught, or a share of each lesson's price, or nothing set yet.
 */
export function MemberPayForm({
  membershipId,
  basis,
  hourlyPence,
  sharePercent,
  onSave,
  onSaved,
  idPrefix = '',
}: {
  membershipId: string;
  basis: PayBasis | null;
  hourlyPence: number | null;
  sharePercent: number | null;
  onSave: (values: Values) => Promise<Result<null>>;
  onSaved: () => void;
  idPrefix?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof memberPaySchema>>({
    resolver: zodResolver(memberPaySchema),
    defaultValues: {
      membershipId,
      basis: basis ?? '',
      hourly: penceAsTyped(hourlyPence),
      share: sharePercent === null ? '' : String(sharePercent),
      from: '',
    },
  });
  const { errors } = form.formState;
  const chosen = useWatch({ control: form.control, name: 'basis' });

  // Checked here first, then sent as typed: the server reads the pounds itself.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSave(form.getValues());
      if (result.ok) {
        onSaved();
        return;
      }
      const fields = result.fields ?? {};
      if (fields.hourly) form.setError('hourly', { message: fields.hourly });
      if (fields.share) form.setError('share', { message: fields.share });
      if (fields.from) form.setError('from', { message: fields.from });
      if (!fields.hourly && !fields.share && !fields.from) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="How they are paid" error={errors.basis?.message}>
        <Select id={`${idPrefix}pay-basis`} options={[{ value: '', label: 'Not set yet' }, ...payBases]} {...form.register('basis')} />
      </Field>
      {chosen === 'hourly' ? (
        <Field label="Rate an hour, £" hint="For every hour taught, a no-show included." error={errors.hourly?.message}>
          <Input id={`${idPrefix}pay-hourly`} inputMode="decimal" autoComplete="off" {...form.register('hourly')} />
        </Field>
      ) : null}
      {chosen === 'share' ? (
        <Field label="Share of each lesson, %" hint="Of what the learner pays for it." error={errors.share?.message}>
          <Input id={`${idPrefix}pay-share`} inputMode="numeric" autoComplete="off" {...form.register('share')} />
        </Field>
      ) : null}
      <Field label="Starting from the week of" hint="Leave it for this week. Weeks before keep the pay they had." error={errors.from?.message}>
        <Input id={`${idPrefix}pay-from`} type="date" {...form.register('from')} />
      </Field>
      <SubmitButton width="responsive" pending={pending}>
        Save pay
      </SubmitButton>
    </ClientForm>
  );
}
