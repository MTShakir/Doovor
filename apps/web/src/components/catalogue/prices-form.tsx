'use client';

import { effectivePence, penceAsTyped, type PriceRow } from '@repo/core/catalogue';
import { formatPence } from '@repo/core/money';
import type { Result } from '@repo/core/result';
import { formatMinutes } from '@repo/core/time';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';

export interface PricesFormProps {
  rows: PriceRow[];
  /**
   * business: the Business's own prices, a blank taking that lesson off.
   * own: an instructor's own prices over the Business's, a blank going back to the Business's.
   */
  mode: 'business' | 'own';
  save: (input: unknown) => Promise<Result<null>>;
}

function keyOf(row: PriceRow): string {
  return `${row.lessonTypeId}:${String(row.durationMinutes)}`;
}

/** R-05, SCH-04: a price for each lesson type and length, all saved together. */
export function PricesForm({ rows, mode, save }: PricesFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [keyOf(row), penceAsTyped(mode === 'business' ? row.businessPence : row.ownPence)])),
  );
  const types = [...new Map(rows.map((row) => [row.lessonTypeId, row.lessonType])).entries()];

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    startTransition(async () => {
      // The pounds as typed: the server turns them into pence itself, from the same rules.
      const result = await save({
        prices: rows.map((row) => ({
          lessonTypeId: row.lessonTypeId,
          durationMinutes: row.durationMinutes,
          price: values[keyOf(row)] ?? '',
        })),
      });
      if (result.ok) {
        toast('Prices saved');
        router.refresh();
        return;
      }
      const byRow: Record<string, string> = {};
      for (const [field, message] of Object.entries(result.fields ?? {})) {
        const index = /^prices\.(\d+)\./.exec(field)?.[1];
        const row = index === undefined ? undefined : rows[Number(index)];
        if (row) byRow[keyOf(row)] = message;
      }
      setErrors(byRow);
      if (Object.keys(byRow).length === 0) setFormError(result.message);
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {types.map(([typeId, typeName]) => (
        <fieldset key={typeId} className="flex flex-col gap-3">
          <legend className="mb-2 text-body font-semibold text-black">{typeName}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {rows
              .filter((row) => row.lessonTypeId === typeId)
              .map((row) => {
                const key = keyOf(row);
                const hint =
                  mode === 'business'
                    ? 'Leave empty if you do not offer it.'
                    : row.businessPence === null
                      ? 'The school does not offer it.'
                      : `School price ${formatPence(row.businessPence)}. Leave empty to use it.`;
                return (
                  <Field key={key} label={`Price for ${formatMinutes(row.durationMinutes)}`} hint={hint} error={errors[key]}>
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={mode === 'own' && row.businessPence !== null ? penceAsTyped(row.businessPence) : undefined}
                      value={values[key] ?? ''}
                      onChange={(event) => {
                        const typed = event.target.value;
                        setValues((current) => ({ ...current, [key]: typed }));
                      }}
                    />
                  </Field>
                );
              })}
          </div>
        </fieldset>
      ))}
      {mode === 'own' ? (
        <p className="text-small text-grey-700">
          Learners see the price that applies to you:{' '}
          {rows
            .filter((row) => effectivePence(row) !== null)
            .map((row) => `${formatMinutes(row.durationMinutes)} ${formatPence(effectivePence(row) ?? 0)}`)
            .join(', ') || 'nothing yet'}
          .
        </p>
      ) : null}
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save prices
      </SubmitButton>
    </ClientForm>
  );
}
