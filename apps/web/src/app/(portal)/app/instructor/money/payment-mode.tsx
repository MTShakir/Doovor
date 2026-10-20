'use client';

import { paymentModeCopy, type PaymentMode } from '@repo/core/payment-modes';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { ProTag } from '@/components/pro';
import { setPaymentMode } from './actions';

export interface PaymentModeChoiceProps {
  current: PaymentMode;
  /** The choices this Business can make today. */
  choices: PaymentMode[];
  /** Charging the day before is not on this Business's plan, so it shows as Pro (D-302). */
  dayBeforeIsPro?: boolean;
  /** Where the plan lives for this portal. */
  planHref?: string;
}

/**
 * PAY-03: the owner chooses how learners pay. It saves as it changes, so the screen keeps one
 * button, and it says what the choice means under it.
 */
export function PaymentModeChoice({ current, choices, dayBeforeIsPro = false, planHref = '/app/instructor/plan' }: PaymentModeChoiceProps) {
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

  const pro = (one: PaymentMode): boolean => dayBeforeIsPro && one === 'before_lesson';

  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Learners pay">
        <Select
          value={mode}
          disabled={pending}
          onChange={(event) => { choose(event.target.value as PaymentMode); }}
          options={choices.map((one) => ({
            value: one,
            label: pro(one) ? `${paymentModeCopy[one].label} (Pro)` : paymentModeCopy[one].label,
            disabled: pro(one),
          }))}
        />
      </Field>
      {/* What the choice means sits under it, where the eye goes after choosing. Chosen on Pro and
          kept on Free, it says what happens instead until the plan carries it again (D-302). */}
      <p className="text-body text-ink">
        {pro(mode) ? 'Until you are on Pro again, learners pay when they book.' : paymentModeCopy[mode].description}
      </p>
      <p className="text-small text-grey-700">Lessons already booked keep the way they were booked.</p>
      {dayBeforeIsPro ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-grey-700">
          <ProTag />
          <span>Charging the saved card the day before the lesson is part of Pro.</span>
          <Link href={planHref as Route} className="inline-flex min-h-6 items-center font-semibold text-blue underline underline-offset-4">
            See what Pro includes
          </Link>
        </p>
      ) : null}
    </div>
  );
}
