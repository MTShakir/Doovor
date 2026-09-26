'use client';

import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { TriangleAlert } from 'lucide-react';
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
      {/*
        UX: this says a learner cannot pay yet, which is the most consequential sentence on the
        screen, and it was grey body text among more grey body text. It now sits on the palest
        yellow with the attention icon, the same treatment money owed gets on the Money screen,
        so the one thing standing between an instructor and getting paid is the thing they see.
      */}
      {accepting && !ready ? (
        <p className="flex items-start gap-2 rounded-card bg-yellow-100 px-3 py-2 text-small text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          There is one thing left: set up card payments below, and learners can start paying.
        </p>
      ) : null}
    </div>
  );
}
