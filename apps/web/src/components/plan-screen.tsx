import { foundingOffer } from '@repo/config/plans';
import { loyaltyEveryMonths, loyaltyMonthsToMost, loyaltyMostPercent, loyaltyStepPercent } from '@repo/core/loyalty';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { StatusPill } from '@repo/ui/status-pill';
import { Check, Clock, MessageSquarePlus, Sparkles, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import type { BusinessPlan } from '@/lib/billing/plan';
import { planSummaries } from '@/lib/site/plan-features';
import { ProTag } from './pro';
import type { ReactNode } from 'react';

/** How long is left, as somebody would say it. */
function leftToRun(daysLeft: number): string {
  if (daysLeft <= 0) return 'Ended';
  if (daysLeft === 1) return '1 day left';
  return `${String(daysLeft)} days left`;
}

/**
 * A countdown is worth reading while it is close. A founding offer with eleven months to run is a
 * date, not a countdown, and a pill saying "365 days left" is noise on every visit.
 */
const countdownWithin = 90;

function Ticked({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((one) => (
        <li key={one} className="flex items-start gap-3">
          <Check className="mt-0.5 size-5 shrink-0 text-green" aria-hidden />
          <span className="text-body text-ink">{one}</span>
        </li>
      ))}
    </ul>
  );
}

/** What is coming, in grey with a clock, so nothing here reads as something they have (D-116). */
function Waiting({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((one) => (
        <li key={one} className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-grey-400" aria-hidden />
          <span className="text-body text-grey-700">{one}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a Business is on, for the owner (D-203, D-204, D-209): the plan, the founding place if they
 * have one, what it carries, and what is still on its way.
 *
 * Both lists come from the same catalogue the pricing page reads, so the app and the site can
 * never disagree about what is built. That mattered: this screen used to carry a hand written list
 * claiming Gap Fill and the waiting list as things a Pro instructor had, and neither exists.
 *
 * `subscribe` is where Pro is actually taken or stopped (9.18, D-231). It is passed in rather
 * than rendered here because this screen is shown to schools too, and a school pays per
 * instructor on the School plan instead (D-231). A school passes nothing and sees no card.
 */
export function PlanScreen({
  plan,
  subscribe,
  subscribed = false,
}: {
  plan: BusinessPlan;
  subscribe?: ReactNode;
  /** Whether a subscription is paying for this plan, which changes what the date means. */
  subscribed?: boolean;
}) {
  const summaries = planSummaries();
  const mine = summaries.find((one) => one.key === plan.plan);
  const pro = summaries.find((one) => one.key === 'pro');
  const paid = plan.plan !== 'free';
  if (!mine) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="plan-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle id="plan-title">{plan.planLabel}</CardTitle>
            <CardDescription>{plan.businessName}</CardDescription>
          </div>
          {plan.daysLeft === null || plan.daysLeft > countdownWithin ? null : (
            <StatusPill status={plan.daysLeft <= 7 ? 'attention' : 'confirmed'}>{leftToRun(plan.daysLeft)}</StatusPill>
          )}
        </div>

        {plan.founding ? (
          <div className="flex items-start gap-3 rounded-card bg-yellow px-4 py-3">
            <Sparkles className="size-5 shrink-0 text-black" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-body font-semibold text-black">Founding member</p>
              <p className="text-small text-black">
                You were one of the first {foundingOffer.instructorLimit} to join. That stays yours for good, whatever plan you
                are on later.
              </p>
            </div>
          </div>
        ) : null}

        {/* A subscription writes the day it is paid up to into the same field a founding place or
            a trial uses, so the date means something different and the sentence has to as well.
            "Free until" on a plan somebody is paying for, on the day they are next charged, is
            the worst of the three ways to put it (D-231). */}
        {subscribed ? (
          <p className="text-body text-ink">
            {plan.runsTo === null ? 'This plan runs on.' : `Paid up to ${plan.runsTo}.`} What happens next is just below.
          </p>
        ) : plan.runsTo === null ? (
          <p className="text-body text-ink">
            {paid ? 'This plan runs on.' : 'Free has no end date. Go Pro whenever you are ready.'}
          </p>
        ) : (
          <p className="text-body text-ink">
            {plan.trial ? 'Your free trial runs to' : 'Free until'} {plan.runsTo}.{' '}
            {plan.daysLeft !== null && plan.daysLeft <= 0
              ? 'We will be in touch about carrying on.'
              : 'Nothing is charged before then, and we will tell you well before it ends.'}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3" role="region" aria-labelledby="included-title">
        <CardTitle id="included-title">What you have</CardTitle>
        <Ticked items={mine.features} />
      </Card>

      {/* On Free, what the plan above carries, so the choice is a list rather than a price. */}
      {!paid && pro ? (
        <Card className="flex flex-col gap-3 bg-yellow-100" role="region" aria-labelledby="pro-adds-title">
          <span className="flex flex-wrap items-center gap-2">
            <CardTitle id="pro-adds-title">What Pro adds</CardTitle>
            <ProTag />
          </span>
          <Ticked items={pro.features} />
        </Card>
      ) : null}

      {subscribe}

      {mine.later.length > 0 ? (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="later-title">
          <div className="flex flex-col gap-1">
            <CardTitle id="later-title">On the way</CardTitle>
            <CardDescription>Being built now. Nothing here is switched on yet.</CardDescription>
          </div>
          <Waiting items={mine.later} />
        </Card>
      ) : null}

      {/* D-206: the promise, in the same numbers billing will use when it arrives. */}
      <Card className="flex flex-col gap-3" role="region" aria-labelledby="loyalty-title">
        <div className="flex items-start gap-3">
          <TrendingDown className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle id="loyalty-title">Staying costs less</CardTitle>
            <CardDescription>
              Once you are paying, every {String(loyaltyEveryMonths)} months takes another {String(loyaltyStepPercent)}% off
              your price, up to {String(loyaltyMostPercent)}% after {String(loyaltyMonthsToMost)} months. Leaving puts it back
              to nothing.
            </CardDescription>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-3" role="region" aria-labelledby="request-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="request-title">Something missing?</CardTitle>
          <CardDescription>
            Tell us what would make this work better for you. What people ask for most is what gets built next.
          </CardDescription>
        </div>
        <Button asChild variant="secondary" width="full">
          <Link href="/feedback">
            <MessageSquarePlus className="size-5" aria-hidden />
            Request a feature
          </Link>
        </Button>
      </Card>
    </div>
  );
}
