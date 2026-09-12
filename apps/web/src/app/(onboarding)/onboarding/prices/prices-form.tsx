'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { formatPence, parsePoundsToPence } from '@repo/core/money';
import { onboardingPricesSchema, packageHours } from '@repo/core/schemas/onboarding';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { savePrices } from '../../actions';

type Values = z.input<typeof onboardingPricesSchema>;

interface PricesFormProps {
  hourlyPrice: number | null;
  packagePrice: number | null;
}

/** Pence back into the pounds a person typed, without a currency sign in the field. */
function pounds(pence: number | null): string {
  if (pence === null) return '';
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

export function PricesForm({ hourlyPrice, packagePrice }: PricesFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [hourly, setHourly] = useState(pounds(hourlyPrice));
  // No default values: the fields keep anything typed before hydration (ClientForm, D-043).
  // The schema turns pounds into pence, so the values the form holds and the values it
  // submits are different types.
  const form = useForm<Values, unknown, z.output<typeof onboardingPricesSchema>>({
    resolver: zodResolver(onboardingPricesSchema),
  });
  const { errors } = form.formState;

  const perHour = parsePoundsToPence(hourly);
  const suggestion = perHour === null ? null : perHour * packageHours;

  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      // The pounds someone typed, not the pence this form worked out: the server does that
      // conversion itself, from the same schema, so it never trusts a number from a browser.
      const result = await savePrices(form.getValues());
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
      <Field
        label="Price for an hour"
        hint="Longer lessons start from this and can be changed later."
        error={errors.hourlyPrice?.message}
      >
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="42"
          defaultValue={pounds(hourlyPrice)}
          {...form.register('hourlyPrice', { onChange: (event: { target: { value: string } }) => { setHourly(event.target.value); } })}
        />
      </Field>
      <Field
        label={`Price for ${String(packageHours)} hours, if you sell a block`}
        hint={
          suggestion === null
            ? 'Leave this empty if you do not sell packages.'
            : `${formatPence(suggestion)} at your hourly price. Most instructors charge a little less. Leave it empty if you do not sell packages.`
        }
        error={errors.packagePrice?.message}
      >
        <Input inputMode="decimal" autoComplete="off" placeholder="380" defaultValue={pounds(packagePrice)} {...form.register('packagePrice')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
