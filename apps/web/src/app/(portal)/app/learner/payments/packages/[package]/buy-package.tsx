'use client';

import { formatPence } from '@repo/core/money';
import { formatMinutes } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { track } from '@/lib/analytics/track';
import { FormAlert } from '@/components/form-alert';
import { CardForm, checkWithBank } from '@/components/payments/card-form';
import type { KeptCardOption } from '../../../pay/[booking]/pay-lesson';
import { payPackageWithSavedCard, payPackageWithTestCard, startPackageCheckout } from './actions';

export interface BuyPackageProps {
  packageId: string;
  /** One per visit to this screen, so pressing twice pays once (R-11). */
  attemptId: string;
  name: string;
  minutes: number;
  pricePence: number;
  businessName: string;
  /** Cards this learner kept with this Business that still work, newest first (PAY-02). */
  savedCards: KeptCardOption[];
  /** True when this environment has a real payments provider behind it. */
  live: boolean;
}

const startNowMessage = 'Tick "Start my lessons straight away" to buy this package.';

/**
 * Buying a package of lessons (PAY-04, M3-13).
 *
 * Online, the learner can cancel for fourteen days, so they are asked whether their lessons may
 * start inside that time, and told what cancelling gives back, before anything is taken (D-086).
 * What the payment buys is written down by the webhook, never by this screen.
 */
export function BuyPackage({ packageId, attemptId, name, minutes, pricePence, businessName, savedCards, live }: BuyPackageProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startNow, setStartNow] = useState(false);
  const [checkout, setCheckout] = useState<{ clientSecret: string; accountId: string } | null>(null);
  const [mode, setMode] = useState<'saved' | 'new'>(savedCards.length > 0 ? 'saved' : 'new');
  const [chosen, setChosen] = useState<string>(savedCards[0]?.paymentMethodId ?? '');
  const [saveCard, setSaveCard] = useState(false);

  const price = formatPence(pricePence);
  const card = savedCards.find((one) => one.paymentMethodId === chosen) ?? savedCards[0];
  // The client secret is the payment's id and a secret, joined: the id is the first part.
  const intentId = checkout === null ? null : (checkout.clientSecret.split('_secret')[0] ?? null);

  const bought = (confirming: boolean) => {
    track('package_purchased', { hours: Math.round((minutes / 60) * 10) / 10 });
    track('payment_succeeded', { method: chosen === '' ? 'card' : 'saved_card' });
    toast(confirming ? 'Payment taken. Your credit shows in a few seconds.' : `${formatMinutes(minutes)} of credit added`);
    router.push('/app/learner/payments');
  };

  /** The one question that has to be answered before any money is asked for. */
  const ready = (): boolean => {
    if (startNow) return true;
    setError(startNowMessage);
    return false;
  };

  const payWithCard = () => {
    if (!card || !ready()) return;
    setError(null);
    startTransition(async () => {
      const result = await payPackageWithSavedCard({ packageId, attemptId, startNow, paymentMethodId: card.paymentMethodId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.status === 'check') {
        const problem = await checkWithBank(result.data.accountId, result.data.clientSecret);
        if (problem === null) bought(true);
        else setError(problem);
        return;
      }
      bought(result.data.status === 'confirming');
    });
  };

  const start = () => {
    if (!ready()) return;
    setError(null);
    startTransition(async () => {
      const result = await startPackageCheckout({ packageId, attemptId, startNow, saveCard });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCheckout({ clientSecret: result.data.clientSecret, accountId: result.data.accountId });
    });
  };

  const finish = (outcome: 'succeeded' | 'failed') => {
    if (intentId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await payPackageWithTestCard({ packageId, paymentIntentId: intentId, outcome });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (outcome === 'failed') {
        setError('The card was refused. Try another one.');
        return;
      }
      bought(false);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        checked={startNow}
        disabled={checkout !== null}
        onCheckedChange={(value) => {
          setStartNow(value === true);
          if (value === true && error === startNowMessage) setError(null);
        }}
        label="Start my lessons straight away"
        description={`You can still change your mind within 14 days of buying. ${businessName} then refunds the hours you have not used, at the price you paid for them.`}
      />

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
      ) : checkout === null ? (
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={saveCard}
            onCheckedChange={(value) => { setSaveCard(value === true); }}
            label="Save this card for next time"
            description={`${businessName} keeps it, so paying them next time takes one press, and can charge it a late cancellation or no-show fee under its cancellation policy. You can remove it in Payments.`}
          />
          <Button width="responsive" size="lg" pending={pending} onClick={start}>
            <CreditCard className="size-5" aria-hidden />
            Pay {price} for {name}
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
        <CardForm
          accountId={checkout.accountId}
          clientSecret={checkout.clientSecret}
          purpose="payment"
          submitLabel={`Pay ${price}`}
          returnPath={`/app/learner/payments/packages/${packageId}`}
          onConfirmed={() => { bought(true); }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-small text-grey-700">
            There is no card machine on this environment. These two stand in for one, and go the same way a real
            payment does.
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
