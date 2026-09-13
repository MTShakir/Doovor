'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { payWithSavedCard, payWithTestCard, startCheckout } from './actions';

export interface KeptCardOption {
  paymentMethodId: string;
  /** "Visa ending 4242". */
  label: string;
  /** "12/30". */
  expiry: string;
}

export interface PayLessonProps {
  bookingId: string;
  pricePence: number;
  businessName: string;
  /** Cards this learner kept with this Business that still work, newest first (PAY-02). */
  savedCards: KeptCardOption[];
  /** True when this environment has a real payments provider behind it. */
  live: boolean;
}

/** How long to keep looking for the webhook before leaving the learner with a message instead. */
const CONFIRM_POLLS = 15;

/**
 * Paying for a lesson (PAY-02, M3-05, M3-07).
 *
 * A learner with a card kept for this Business pays with it in one press. Anybody else types a
 * card, and chooses whether this Business keeps it for next time. Either way the lesson is
 * confirmed by the webhook, never by this screen.
 */
export function PayLesson({ bookingId, pricePence, businessName, savedCards, live }: PayLessonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [mode, setMode] = useState<'saved' | 'new'>(savedCards.length > 0 ? 'saved' : 'new');
  const [chosen, setChosen] = useState<string>(savedCards[0]?.paymentMethodId ?? '');
  const [saveCard, setSaveCard] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const price = formatPence(pricePence);
  const card = savedCards.find((one) => one.paymentMethodId === chosen) ?? savedCards[0];

  // The money is taken and the webhook is on its way. The page says paid once it lands, which
  // replaces this component, so looking stops by itself.
  useEffect(() => {
    if (!confirming) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      router.refresh();
      if (polls >= CONFIRM_POLLS) clearInterval(timer);
    }, 2000);
    return () => { clearInterval(timer); };
  }, [confirming, router]);

  const payWithCard = () => {
    if (!card) return;
    setError(null);
    startTransition(async () => {
      const result = await payWithSavedCard({ bookingId, paymentMethodId: card.paymentMethodId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.status === 'confirming') {
        setConfirming(true);
        return;
      }
      toast('Lesson paid for');
      router.refresh();
    });
  };

  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await startCheckout({ bookingId, saveCard });
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

  if (confirming) {
    return (
      <p className="text-body text-ink" role="status">
        Payment taken. Confirming your lesson, which takes a few seconds.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}

      {mode === 'saved' && card ? (
        <div className="flex flex-col gap-3">
          {savedCards.length > 1 ? (
            <Field label="Card">
              <Select
                value={card.paymentMethodId}
                onChange={(event) => { setChosen(event.target.value); }}
                options={savedCards.map((one) => ({
                  value: one.paymentMethodId,
                  label: `${one.label}, expires ${one.expiry}`,
                }))}
              />
            </Field>
          ) : (
            <p className="flex items-center gap-2 text-body text-ink">
              <CreditCard className="size-5 shrink-0 text-grey-700" aria-hidden />
              {card.label}, expires {card.expiry}
            </p>
          )}
          <Button width="responsive" size="lg" pending={pending} onClick={payWithCard}>
            Pay {price} with {card.label}
          </Button>
          <Button
            variant="secondary"
            width="responsive"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMode('new');
            }}
          >
            Use a different card
          </Button>
        </div>
      ) : intentId === null ? (
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={saveCard}
            onCheckedChange={(value) => { setSaveCard(value === true); }}
            label="Save this card for next time"
            description={`${businessName} keeps it, so your next lesson takes one press. You can remove it in Payments.`}
          />
          <Button width="responsive" size="lg" pending={pending} onClick={start}>
            <CreditCard className="size-5" aria-hidden />
            Pay {price}
          </Button>
          {savedCards.length > 0 ? (
            <Button
              variant="secondary"
              width="responsive"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMode('saved');
              }}
            >
              Pay with a saved card
            </Button>
          ) : null}
        </div>
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
