import { foundingOffer } from '@repo/config/plans';
import { loyaltyEveryMonths, loyaltyMonthsToMost, loyaltyMostPercent, loyaltyStepPercent } from '@repo/core/loyalty';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { StatusPill } from '@repo/ui/status-pill';
import { Check, Sparkles, TrendingDown } from 'lucide-react';
import type { BusinessPlan } from '@/lib/billing/plan';
import { paidPlanIncludes } from '@/lib/billing/plan';

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

/**
 * What a Business is on, for the owner (D-203, D-204): the plan, the founding place if they have
 * one, and the day it runs to. Billing itself arrives in Phase 2 (D-022), so nothing here charges
 * anybody or changes a plan; it says what they have and until when, which is the thing somebody on
 * a trial cannot otherwise find out.
 */
export function PlanScreen({ plan }: { plan: BusinessPlan }) {
  const paid = plan.plan !== 'free';
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

        {plan.runsTo === null ? (
          <p className="text-body text-ink">
            {paid ? 'This plan runs on.' : 'Free has no end date. Upgrade whenever you are ready.'}
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

      {paid ? (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="included-title">
          <CardTitle id="included-title">What you have</CardTitle>
          <ul className="flex flex-col gap-2">
            {paidPlanIncludes.map((one) => (
              <li key={one} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-green" aria-hidden />
                <span className="text-body text-ink">{one}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="pro-title">
          <CardTitle id="pro-title">What the paid plan adds</CardTitle>
          <ul className="flex flex-col gap-2">
            {paidPlanIncludes.map((one) => (
              <li key={one} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-grey-700" aria-hidden />
                <span className="text-body text-ink">{one}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
