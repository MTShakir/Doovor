/**
 * Staying costs less (D-206). Every three months somebody stays on a paid plan takes another 5%
 * off the price, up to 30%, and leaving puts it back to nothing.
 *
 * Nothing charges anybody yet, so nothing here is applied to a price: subscription billing is
 * Phase 2 (D-022). What this is for now is saying the promise in one place, in the same numbers
 * the screens and the pricing page use, so when billing arrives it reads the rule rather than
 * inventing a second copy of it.
 */

/** Months of paying in a row before another step is earned. */
export const loyaltyEveryMonths = 3;

/** What each step takes off. */
export const loyaltyStepPercent = 5;

/** As far as it goes, however long somebody stays. */
export const loyaltyMostPercent = 30;

/** How long it takes to reach the most: 18 months. */
export const loyaltyMonthsToMost = (loyaltyMostPercent / loyaltyStepPercent) * loyaltyEveryMonths;

/**
 * What comes off the price after this many months paid in a row.
 *
 * The months are consecutive months on a paid plan. A month is counted once it is paid for and
 * over, so three months in gives the first 5%, not the day the third month starts. Somebody who
 * leaves starts again from nothing, which is the caller's business: it passes the run of months
 * since they last did, not their months in total.
 */
export function loyaltyDiscount(monthsPaidInARow: number): number {
  if (!Number.isFinite(monthsPaidInARow) || monthsPaidInARow <= 0) return 0;
  const steps = Math.floor(monthsPaidInARow / loyaltyEveryMonths);
  return Math.min(steps * loyaltyStepPercent, loyaltyMostPercent);
}

/** The next step and how many months away it is, or null once it is as low as it goes. */
export function nextLoyaltyStep(monthsPaidInARow: number): { percent: number; monthsAway: number } | null {
  const months = Number.isFinite(monthsPaidInARow) && monthsPaidInARow > 0 ? Math.floor(monthsPaidInARow) : 0;
  const now = loyaltyDiscount(months);
  if (now >= loyaltyMostPercent) return null;
  const nextAt = (Math.floor(months / loyaltyEveryMonths) + 1) * loyaltyEveryMonths;
  return { percent: now + loyaltyStepPercent, monthsAway: nextAt - months };
}

/** A whole-pence price with the discount taken off, rounded to the nearest penny. */
export function priceAfterLoyalty(pricePence: number, monthsPaidInARow: number): number {
  const percent = loyaltyDiscount(monthsPaidInARow);
  if (percent === 0) return pricePence;
  return Math.round((pricePence * (100 - percent)) / 100);
}
