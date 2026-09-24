'use client';

import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { setPaymentMode } from './actions';

/**
 * Whether learners are asked for a card at all (PAY-03, D-195).
 *
 * There is no second switch behind this: being paid in person is one of the ways a Business can
 * choose to be paid, so turning this off chooses it and turning it on goes back to paying when
 * they book. Anything already booked keeps the terms it was booked on.
 */
export function AcceptPayments({ on, ready }: { on: boolean; ready: boolean }) {
  const [accepting, setAccepting] = useState(on);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (wanted: boolean) => {
    setError(null);
    setAccepting(wanted);
    startTransition(async () => {
      const result = await setPaymentMode({ mode: wanted ? 'at_booking' : 'offline' });
      if (!result.ok) {
        setAccepting(!wanted);
        setError(result.message);
        return;
      }
      toast(wanted ? 'Learners can pay online' : 'Learners pay you in person');
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Switch
        label="Accept online payments"
        description={
          accepting
            ? 'Learners can pay by card, Apple Pay or Google Pay.'
            : 'Learners pay you in cash or by bank transfer, and are never asked for a card.'
        }
        checked={accepting}
        disabled={pending}
        onCheckedChange={change}
      />
      {accepting && !ready ? (
        <p className="text-small text-grey-700">
          There is one thing left: set up card payments below, and learners can start paying.
        </p>
      ) : null}
    </div>
  );
}
