'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { feePeriods, schoolFeeTermsSchema } from '@repo/core/school-fees';
import type { Result } from '@repo/core/result';
import type { z } from '@repo/core/zod';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import type { TypedFeeTerms } from '@/lib/school/fees';

type Values = z.input<typeof schoolFeeTermsSchema>;
type FieldName = 'period' | 'fee' | 'startsOn' | 'freeWeeks' | 'pupilFee';

/**
 * What a linked instructor pays the school (M9-11, D-287): a fee every week or month from a date,
 * after any free weeks, and a fee for each pupil the school introduces. A new amount applies from
 * the next fee.
 */
export function FeeTermsForm({
  linkId,
  current,
  onSave,
  onSaved,
  idPrefix = '',
}: {
  linkId: string;
  current: TypedFeeTerms;
  onSave: (values: Values) => Promise<Result<null>>;
  onSaved?: () => void;
  idPrefix?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof schoolFeeTermsSchema>>({
    resolver: zodResolver(schoolFeeTermsSchema),
    defaultValues: { linkId, ...current },
  });
  const { errors } = form.formState;
  const period = useWatch({ control: form.control, name: 'period' });

  // Checked here first, then sent as typed: the server reads the pounds itself.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSave(form.getValues());
      if (result.ok) {
        onSaved?.();
        return;
      }
      const fields = (result.fields ?? {}) as Partial<Record<FieldName, string>>;
      const named = (Object.keys(fields) as FieldName[]).filter((name) => fields[name] !== undefined);
      for (const name of named) form.setError(name, { message: fields[name] });
      if (named.length === 0) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="How often" error={errors.period?.message}>
        <Select
          id={`${idPrefix}fee-period`}
          options={[{ value: '', label: 'No weekly or monthly fee' }, ...feePeriods]}
          {...form.register('period')}
        />
      </Field>
      {period === '' ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={period === 'weekly' ? 'Fee a week, £' : 'Fee a month, £'} error={errors.fee?.message}>
            <Input id={`${idPrefix}fee-amount`} inputMode="decimal" autoComplete="off" {...form.register('fee')} />
          </Field>
          <Field label="Starts on" error={errors.startsOn?.message}>
            <Input id={`${idPrefix}fee-starts`} type="date" {...form.register('startsOn')} />
          </Field>
          <Field label="Free weeks first" hint="The first fee is due after them." error={errors.freeWeeks?.message}>
            <Input id={`${idPrefix}fee-free`} inputMode="numeric" autoComplete="off" {...form.register('freeWeeks')} />
          </Field>
        </div>
      )}
      <Field
        label="Fee for each pupil you introduce, £"
        hint="Optional. Due when their first lesson is booked."
        error={errors.pupilFee?.message}
      >
        <Input id={`${idPrefix}fee-pupil`} inputMode="decimal" autoComplete="off" {...form.register('pupilFee')} />
      </Field>
      <p className="max-w-prose text-small text-grey-700">
        Fees are a record for now: you collect them yourselves, and mark each one paid when it is.
      </p>
      <SubmitButton width="responsive" pending={pending}>
        Save fees
      </SubmitButton>
    </ClientForm>
  );
}
