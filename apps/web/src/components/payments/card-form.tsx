'use client';

import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { useState, type SubmitEvent } from 'react';
import { FormAlert } from '@/components/form-alert';
import { clientEnv } from '@/env/client';
import { alreadyConfirmed, cardErrorMessage } from '@/lib/payments/card-errors';

const colours = brand.colours;

/**
 * The card fields drawn by the payment provider, inside its own frame, dressed as our inputs:
 * grey fields with a dark border that turn white with a black outline when focused (PRD 7.2).
 * Placeholders are grey-700, as everywhere else (D-009).
 */
const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: colours.black,
    colorBackground: colours.white,
    colorText: colours.ink,
    colorTextSecondary: colours['grey-700'],
    colorTextPlaceholder: colours['grey-700'],
    colorIcon: colours['grey-700'],
    colorDanger: colours.red,
    // The frame cannot use the app's own copy of Inter, so it falls back on the system's.
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: '16px',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  rules: {
    '.Label': { color: colours.ink, fontWeight: '500' },
    '.Input': { border: `1px solid ${colours['grey-700']}`, backgroundColor: colours['grey-100'], boxShadow: 'none', padding: '12px 16px' },
    '.Input:focus': { border: `1px solid ${colours.black}`, backgroundColor: colours.white, boxShadow: `0 0 0 1px ${colours.black}` },
    '.Input--invalid': { border: `1px solid ${colours.red}`, backgroundColor: colours.white, boxShadow: 'none' },
    '.Error': { color: colours.red },
    '.Tab': { border: `1px solid ${colours['grey-200']}`, boxShadow: 'none' },
    '.Tab--selected': { border: `1px solid ${colours.black}`, boxShadow: `0 0 0 1px ${colours.black}` },
  },
};

/** One copy of the provider's script for each Business's account, however many forms open (D-011). */
const loaded = new Map<string, Promise<Stripe | null>>();

function stripeFor(publishableKey: string, accountId: string): Promise<Stripe | null> {
  let stripe = loaded.get(accountId);
  if (stripe === undefined) {
    stripe = loadStripe(publishableKey, { stripeAccount: accountId });
    loaded.set(accountId, stripe);
  }
  return stripe;
}

export interface CardFormProps {
  /** The Business's own account: its payments are made on it, never on the platform's (D-011). */
  accountId: string;
  /** From the payment or card set-up the server started for this screen. */
  clientSecret: string;
  /** Taking or holding money, or keeping a card for later with nothing taken. */
  purpose: 'payment' | 'setup';
  /** "Pay £42", "Authorise £42", "Save card". */
  submitLabel: string;
  /** Where the learner comes back to if their bank has to send them away to check it is them. */
  returnPath: string;
  /** The card went through. What it paid for is written down by the webhook, not by the form. */
  onConfirmed: () => void;
}

/**
 * Typing in a card (PAY-02, PAY-03, R-12, M3-23).
 *
 * The card never touches our servers: the provider draws the fields in a frame of its own and
 * sends what is typed straight to itself. When the bank wants to check it is the card holder, the
 * provider asks them on the spot.
 */
export function CardForm(props: CardFormProps) {
  const publishableKey = clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return <FormAlert>Card payments are not set up here yet.</FormAlert>;

  return (
    <Elements stripe={stripeFor(publishableKey, props.accountId)} options={{ clientSecret: props.clientSecret, appearance, loader: 'never' }}>
      <CardFields {...props} />
    </Elements>
  );
}

/** Roughly the height the card fields take once drawn, so the button does not jump. */
export function CardFieldsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

const done = new Set(['succeeded', 'processing', 'requires_capture']);

/**
 * Lets the learner's bank check it is them, for a kept card it will not charge without asking
 * (PAY-02, M3-23). The provider shows the bank's check over the page. Answers what to tell the
 * learner if the payment did not go through, or null when it did.
 */
export async function checkWithBank(accountId: string, clientSecret: string): Promise<string | null> {
  const publishableKey = clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripe = publishableKey ? await stripeFor(publishableKey, accountId) : null;
  if (stripe === null) return 'Card payments are not set up here yet.';

  const result = await stripe.handleNextAction({ clientSecret });
  if (result.error) return alreadyConfirmed(result.error) ? null : cardErrorMessage(result.error);
  const status = result.paymentIntent?.status ?? result.setupIntent?.status;
  return status !== undefined && done.has(status) ? null : cardErrorMessage({ code: 'payment_intent_authentication_failure' });
}

function CardFields({ purpose, submitLabel, returnPath, onConfirmed }: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stripe === null || elements === null || pending) return;
    setPending(true);
    setError(null);
    try {
      const checked = await elements.submit();
      if (checked.error) {
        setError(cardErrorMessage(checked.error));
        return;
      }
      const confirmParams = { return_url: new URL(returnPath, window.location.origin).toString() };
      // The fields were drawn for this payment's own secret, so confirming needs only them.
      const result =
        purpose === 'payment'
          ? await stripe.confirmPayment({ elements, confirmParams, redirect: 'if_required' })
          : await stripe.confirmSetup({ elements, confirmParams, redirect: 'if_required' });
      if (result.error && !alreadyConfirmed(result.error)) {
        setError(cardErrorMessage(result.error));
        return;
      }
      onConfirmed();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} aria-label="Card details">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {ready ? null : <CardFieldsSkeleton />}
      {/* Laid out but flat until drawn: a frame that is not displayed may never load. */}
      <div className={ready ? undefined : 'h-0 overflow-hidden'}>
        <PaymentElement
          options={{ layout: 'tabs', terms: { card: 'never' } }}
          onReady={() => { setReady(true); }}
          onLoadError={() => { setError('The card form did not load. Check your connection and try again.'); }}
        />
      </div>
      <Button type="submit" width="responsive" size="lg" pending={pending} disabled={!ready || stripe === null}>
        {submitLabel}
      </Button>
    </form>
  );
}
