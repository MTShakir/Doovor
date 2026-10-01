'use client';

import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Gift, TrendingDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useTransition } from 'react';
import type { ProSubscription } from '@/lib/billing/subscription';
import { ProTag } from '@/components/pro';
import { setProRenewal, startProCheckout } from './actions';

/**
 * Taking Pro, and stopping it (9.18, D-231).
 *
 * The only thing this sends is 'month' or 'year'. Every figure on it was worked out on the server
 * and arrives as text that has already been formatted: there is no price in this component's
 * state, so there is nothing here to change in a developer console that would change a charge.
 */
export function GoPro({
  subscription,
  alreadyPro,
  runsTo,
}: {
  subscription: ProSubscription;
  /** On Pro already, through a founding place or a trial rather than a payment. */
  alreadyPro: boolean;
  /** The day that free run ends, where there is one. */
  runsTo: string | null;
}) {
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const [pending, startTransition] = useTransition();
  const name = useId();

  const chosen = subscription.offers.find((offer) => offer.interval === interval);
  // Somebody given Pro by a founding place or a trial already has it, and has nothing paying for
  // it. "Go Pro" at them is wrong, and so is hiding the card: what they need is the one that
  // carries on when the free run ends (D-203, D-204, D-231).
  const keeping = alreadyPro;
  const title = keeping ? 'Keep Pro' : 'Go Pro';

  const subscribe = () => {
    startTransition(async () => {
      const result = await startProCheckout({ interval });
      if (!result.ok) {
        toast(result.message);
        return;
      }
      window.location.assign(result.data.url);
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="go-pro-title">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <CardTitle id="go-pro-title">{title}</CardTitle>
          <ProTag />
        </span>
        <CardDescription>
          {!keeping
            ? 'Pick how often you pay. You can stop whenever you like.'
            : runsTo === null
              ? 'You have Pro already. Set up a payment and it carries on whatever happens to the offer that gave it to you.'
              : `Your Pro is free until ${runsTo}. Set up a payment now and it carries on from there.`}
        </CardDescription>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">How often you pay</legend>
        {subscription.offers.map((offer) => {
          const picked = offer.interval === interval;
          return (
            <label
              key={offer.interval}
              className={[
                'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-card border-2 px-4 py-3',
                'transition-colors duration-200 ease-out focus-within:outline-2 focus-within:outline-offset-2',
                'focus-within:outline-black',
                picked ? 'border-black bg-quiet' : 'border-grey-200 hover:bg-quiet',
              ].join(' ')}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="radio"
                  name={name}
                  value={offer.interval}
                  checked={picked}
                  onChange={() => {
                    setInterval(offer.interval);
                  }}
                  className="size-5 accent-black"
                />
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-ink">{offer.label}</span>
                  {offer.interval === 'year' ? (
                    <span className="text-small text-grey-700">{offer.perMonth} a month, paid once a year</span>
                  ) : (
                    <span className="text-small text-grey-700">Billed every month</span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-body font-semibold text-ink">
                  {offer.wasPrice === null ? null : (
                    <span className="mr-1 font-normal text-grey-700 line-through">{offer.wasPrice}</span>
                  )}
                  {offer.price}
                </span>
                {offer.saving === null ? null : <StatusPill status="confirmed">{offer.saving}</StatusPill>}
              </span>
            </label>
          );
        })}
      </fieldset>

      {subscription.monthsPaid > 0 && chosen !== undefined && chosen.discountPercent > 0 ? (
        <div className="flex items-start gap-3 rounded-card bg-quiet px-4 py-3">
          <TrendingDown className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <p className="text-small text-ink">
            {String(chosen.discountPercent)}% off for staying {String(subscription.monthsPaid)} months. It comes off every
            renewal from here.
          </p>
        </div>
      ) : null}

      {subscription.bankedWorth === null ? null : (
        <div className="flex items-start gap-3 rounded-card bg-yellow px-4 py-3">
          <Gift className="mt-0.5 size-5 shrink-0 text-black" aria-hidden />
          <p className="text-small text-black">
            {monthsWord(subscription.bankedMonths)} earned by referring people, worth {subscription.bankedWorth}. It comes off
            this first payment before your card is used.
          </p>
        </div>
      )}

      <Button width="full" pending={pending} onClick={subscribe}>
        {title}
      </Button>
      <p className="text-small text-grey-700">
        It renews by itself. We will email you {String(subscription.noticeDays[interval])} days before each renewal
        {interval === 'year' ? ', and text you too' : ''}, so you always have time to stop.
      </p>
    </Card>
  );
}

/**
 * What an instructor already on Pro sees: where it stands, and the one button that changes it
 * (CAN-06). Stopping never ends it early, so the button says what it actually does.
 */
export function ProSubscriptionCard({ subscription }: { subscription: ProSubscription }) {
  const [pending, startTransition] = useTransition();
  const stopping = subscription.cancelAtPeriodEnd;

  const change = () => {
    startTransition(async () => {
      const result = await setProRenewal({ cancel: !stopping });
      toast(
        !result.ok
          ? result.message
          : result.data.cancelAtPeriodEnd
            ? 'Pro will not renew. You keep it until the end of this period.'
            : 'Pro will carry on renewing.',
      );
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="subscription-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <CardTitle id="subscription-title">Your subscription</CardTitle>
            <ProTag />
          </span>
          {subscription.words === null ? null : <CardDescription>{subscription.words}</CardDescription>}
        </div>
        {subscription.status === 'past_due' ? <StatusPill status="attention">Payment failed</StatusPill> : null}
        {/* Not 'cancelled': that pill strikes its own text through, and a struck through
            "Ending" reads as something broken rather than something ending. */}
        {stopping ? <StatusPill status="attention">Ending</StatusPill> : null}
      </div>

      {subscription.monthsPaid > 0 ? (
        <div className="flex items-start gap-3 rounded-card bg-quiet px-4 py-3">
          <TrendingDown className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <p className="text-small text-ink">
            {String(subscription.monthsPaid)} months paid in a row.{' '}
            {discountWords(subscription)}
          </p>
        </div>
      ) : null}

      {subscription.bankedWorth === null ? null : (
        <div className="flex items-start gap-3 rounded-card bg-yellow px-4 py-3">
          <Gift className="mt-0.5 size-5 shrink-0 text-black" aria-hidden />
          <p className="text-small text-black">
            {monthsWord(subscription.bankedMonths)} earned by referring people, worth {subscription.bankedWorth}, coming off
            your next renewal.
          </p>
        </div>
      )}

      <Button variant="secondary" width="full" pending={pending} onClick={change}>
        {stopping ? 'Keep Pro' : 'Stop renewing'}
      </Button>
      {stopping ? null : (
        <p className="text-small text-grey-700">
          Stopping lets it run to the end of what you have paid for. Nothing is taken after that.
        </p>
      )}
    </Card>
  );
}

/** "1 month" or "3 months", because "1 months" reads as a bug. */
function monthsWord(months: number): string {
  return months === 1 ? '1 month' : `${String(months)} months`;
}

/** What the run of months is worth, or what it is working towards. */
function discountWords(subscription: ProSubscription): string {
  const offer = subscription.offers.find((one) => one.interval === subscription.interval);
  if (offer === undefined || offer.discountPercent === 0) {
    return 'Keep going and your price starts coming down.';
  }
  return `${String(offer.discountPercent)}% is coming off each renewal.`;
}

/**
 * Back from the card page, before the event that grants Pro has arrived (9.18, D-231).
 *
 * The redirect grants nothing: a signed event does, and it can be a moment behind the browser.
 * Showing "Go Pro" in that moment would invite somebody who has just paid to pay again, so this
 * stands in its place and checks for itself rather than making them wonder.
 */
export function WaitingForStripe() {
  const [checking, startChecking] = useTransition();
  const router = useRouter();

  // Stripe is usually ahead of the browser, but not always. One look a few seconds later covers
  // the gap without a spinner that never ends.
  useEffect(() => {
    const again = setTimeout(() => {
      router.refresh();
    }, 4000);
    return () => {
      clearTimeout(again);
    };
  }, [router]);

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="waiting-title">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <CardTitle id="waiting-title">Setting up your subscription</CardTitle>
          <ProTag />
        </span>
        <CardDescription>
          Your payment went through and we are waiting for the card service to confirm it. This is usually seconds. You do
          not need to pay again.
        </CardDescription>
      </div>
      <Button
        variant="secondary"
        width="full"
        pending={checking}
        onClick={() => {
          startChecking(() => {
            router.refresh();
          });
        }}
      >
        Check again
      </Button>
    </Card>
  );
}
