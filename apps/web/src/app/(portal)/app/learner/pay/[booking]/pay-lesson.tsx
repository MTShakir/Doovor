'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { payWithTestCard, startCheckout } from './actions';

export interface PayLessonProps {
  bookingId: string;
  pricePence: number;
  /** True when this environment has a real payments provider behind it. */
  live: boolean;
}

/**
 * Paying for a lesson (PAY-02, M3-05).
 *
 * The payment is started on the server, which holds the slot first. What finishes it depends
 * on the environment: a real card through the provider's own form, or the test card that
 * stands in for one while there is no key, which goes through exactly the same webhook.
 */
export function PayLesson({ bookingId, pricePence, live }: PayLessonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);

  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await startCheckout({ bookingId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The client secret is the payment's id and a secret, joined: the id is the first part.
      setIntentId(result.data.clientSecret.split('_secret')[0] ?? null);
    });
  };

  const finish = (outcome: 'succeeded' | 'failed') => {
    if (intentId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await payWithTestCard({ paymentIntentId: intentId, outcome });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (outcome === 'failed') {
        setError('The card was refused. Try another one.');
        return;
      }
      toast('Lesson paid for');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}

      {intentId === null ? (
        <Button width="responsive" size="lg" pending={pending} onClick={start}>
          <CreditCard className="size-5" aria-hidden />
          Pay {formatPence(pricePence)}
        </Button>
      ) : live ? (
        <p className="text-body text-grey-700">Enter your card details to finish.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-small text-grey-700">
            There is no card machine on this environment. These two stand in for one, and go the same way a
            real payment does.
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button width="responsive" pending={pending} onClick={() => { finish('succeeded'); }}>
              Pay with a test card
            </Button>
            <Button variant="secondary" width="responsive" pending={pending} onClick={() => { finish('failed'); }}>
              Test a refused card
            </Button>
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 text-small text-grey-700">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Your card details go straight to the payment provider. We never see them.
      </p>
    </div>
  );
}
