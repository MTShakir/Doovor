'use client';

import { paymentModeCopy, type PaymentMode } from '@repo/core/payment-modes';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { setPaymentMode } from './actions';

export interface PaymentModeChoiceProps {
  current: PaymentMode;
  /** The choices this Business can make today. */
  choices: PaymentMode[];
}

/**
 * PAY-03: the owner chooses how learners pay. It saves as it changes, so the screen keeps one
 * button, and it says what the choice means under it.
 */
export function PaymentModeChoice({ current, choices }: PaymentModeChoiceProps) {
  const [mode, setMode] = useState<PaymentMode>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (next: PaymentMode) => {
    const before = mode;
    setMode(next);
    setError(null);
    startTransition(async () => {
      const result = await setPaymentMode({ mode: next });
      if (!result.ok) {
        setMode(before);
        setError(result.message);
        return;
      }
      toast(`Learners now pay ${paymentModeCopy[next].label.toLowerCase()}`);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Learners pay">
        <Select
          value={mode}
          disabled={pending}
          onChange={(event) => { choose(event.target.value as PaymentMode); }}
          options={choices.map((one) => ({ value: one, label: paymentModeCopy[one].label }))}
        />
      </Field>
      {/* What the choice means sits under it, where the eye goes after choosing. */}
      <p className="text-body text-ink">{paymentModeCopy[mode].description}</p>
      <p className="text-small text-grey-700">Lessons already booked keep the way they were booked.</p>
    </div>
  );
}
