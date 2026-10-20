'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { linkedPriceGuideSchema, penceAsTyped } from '@repo/core/catalogue';
import type { Result } from '@repo/core/result';
import type { z } from '@repo/core/zod';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';

type Values = z.input<typeof linkedPriceGuideSchema>;

/**
 * What a school recommends its linked instructors charge an hour, and the most it lets them
 * (M9-10, D-286). Their prices are their own: the school may suggest one and cap them, and the law
 * lets it do no more, so there is no fixed or lowest price to set.
 */
export function PriceGuideForm({
  recommendedPence,
  maxPence,
  onSave,
  idPrefix = '',
}: {
  recommendedPence: number | null;
  maxPence: number | null;
  onSave: (values: Values) => Promise<Result<null>>;
  idPrefix?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof linkedPriceGuideSchema>>({
    resolver: zodResolver(linkedPriceGuideSchema),
    defaultValues: { recommended: penceAsTyped(recommendedPence), maximum: penceAsTyped(maxPence) },
  });
  const { errors } = form.formState;

  // Checked here first, then sent as typed: the server reads the pounds itself.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSave(form.getValues());
      if (result.ok) {
        toast('Saved');
        return;
      }
      const fields = result.fields ?? {};
      if (fields.recommended) form.setError('recommended', { message: fields.recommended });
      if (fields.maximum) form.setError('maximum', { message: fields.maximum });
      if (!fields.recommended && !fields.maximum) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Recommended price an hour, £"
          hint="Only a suggestion. They can charge less, or more up to the most."
          error={errors.recommended?.message}
        >
          <Input id={`${idPrefix}guide-recommended`} inputMode="decimal" autoComplete="off" {...form.register('recommended')} />
        </Field>
        <Field label="Most an hour, £" hint="Leave empty for no limit. Lessons and packages are held to it." error={errors.maximum?.message}>
          <Input id={`${idPrefix}guide-maximum`} inputMode="decimal" autoComplete="off" {...form.register('maximum')} />
        </Field>
      </div>
      <p className="max-w-prose text-small text-grey-700">
        The law lets a school recommend a price or set the most, never a fixed price or a lowest one.
      </p>
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save
      </SubmitButton>
    </ClientForm>
  );
}
