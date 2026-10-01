/**
 * What an instructor pays for Pro, and when they are told about it (9.18, D-231).
 *
 * Every figure here is worked out from the plan and from what the Business has actually paid.
 * Nothing in this module takes a price from its caller, and nothing that reaches it comes from a
 * browser: the screen asks for a plan and an interval, and the amount is decided here. That is the
 * whole of the protection against somebody asking to pay a pound for a year of Pro.
 */

import { plans } from '@repo/config/plans';
import { loyaltyDiscount, priceAfterLoyalty } from './loyalty.ts';

/** How often a subscription renews. Stripe's own words, so nothing has to be translated. */
export type BillingInterval = 'month' | 'year';

export const billingIntervals: readonly BillingInterval[] = ['month', 'year'];

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'month' || value === 'year';
}

/** Months one payment covers. A year is twelve, which is what the loyalty rule counts in. */
export function monthsCovered(interval: BillingInterval): number {
  return interval === 'year' ? 12 : 1;
}

/**
 * The list price of Pro for an interval, before anything is taken off. Read from the plan, never
 * from a caller: `plans.ts` is the only place a price exists.
 */
export function proListPricePence(interval: BillingInterval): number {
  const price = interval === 'year' ? plans.pro.yearlyPricePence : plans.pro.monthlyPricePence;
  // A plan with no yearly price cannot be billed yearly. Pro has one; this is here so a plan that
  // loses it fails loudly rather than charging nothing.
  if (price === null) throw new RangeError(`Pro has no ${interval} price`);
  return price;
}

/**
 * What to charge for the next period: the list price with the loyalty discount taken off (D-206).
 *
 * `monthsPaidInARow` is the run of months already paid for, which the database keeps and the
 * browser never sends. Somebody who left and came back passes the new run, not their total.
 */
export function subscriptionPricePence(input: { interval: BillingInterval; monthsPaidInARow: number }): number {
  return priceAfterLoyalty(proListPricePence(input.interval), input.monthsPaidInARow);
}

/** What the screen says is coming off, as a whole percentage. */
export function subscriptionDiscountPercent(monthsPaidInARow: number): number {
  return loyaltyDiscount(monthsPaidInARow);
}

/**
 * A month earned by referring somebody is worth a month of Pro at the monthly price (D-205, D-231).
 *
 * It is worth the same whether they are billed monthly or yearly, because what was promised is a
 * month of Pro and not a share of whatever they happen to be paying. The loyalty discount is not
 * applied to it: a discount is a reduction in a price, and this is a credit against one.
 */
export function bankedMonthsCreditPence(months: number): number {
  const whole = Number.isFinite(months) && months > 0 ? Math.floor(months) : 0;
  return whole * plans.pro.monthlyPricePence;
}

/**
 * How many whole months of Pro a sum of credit was worth (D-205, D-231).
 *
 * The other direction from `bankedMonthsCreditPence`, and the reason it has to exist: Stripe
 * reports what credit an invoice consumed in pence, and what we have to mark spent is referral
 * months. Rounded down, so a part month of credit left over does not spend a whole month.
 */
export function monthsFromCreditPence(pence: number): number {
  if (!Number.isFinite(pence) || pence <= 0) return 0;
  return Math.floor(pence / plans.pro.monthlyPricePence);
}

/**
 * How much notice before a renewal (D-231). A fortnight for a year, three days for a month: notice
 * in proportion to the charge, and enough on the yearly one to cancel before £120 leaves an
 * account, which is what the law expects of an automatic renewal.
 */
export const renewalNoticeDays: Record<BillingInterval, number> = { year: 14, month: 3 };

/** A yearly renewal is worth a text as well as an email. A monthly one is not. */
export function remindByText(interval: BillingInterval): boolean {
  return interval === 'year';
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a renewal notice is due now: inside the notice window and not yet past. A subscription
 * already cancelled is not renewing, so nobody is warned about a charge that is not coming.
 */
export function renewalNoticeDue(input: {
  interval: BillingInterval;
  renewsAt: Date;
  now: Date;
  cancelAtPeriodEnd: boolean;
}): boolean {
  if (input.cancelAtPeriodEnd) return false;
  const until = input.renewsAt.getTime() - input.now.getTime();
  if (until <= 0) return false;
  return until <= renewalNoticeDays[input.interval] * DAY;
}

/** Where a subscription stands, in Stripe's words. */
export type SubscriptionStatus = 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

const carriesPro: readonly SubscriptionStatus[] = ['trialing', 'active', 'past_due'];

/**
 * Whether a subscription entitles the Business to Pro right now.
 *
 * `past_due` still does: a card that failed once is somebody to chase, not somebody to cut off
 * mid-week, and Stripe retries for days before giving up. `unpaid` and `canceled` do not.
 */
export function subscriptionCarriesPro(status: SubscriptionStatus): boolean {
  return carriesPro.includes(status);
}

/** What the plan screen says about where somebody stands. */
export function subscriptionWords(input: {
  status: SubscriptionStatus;
  interval: BillingInterval;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  formatDate: (date: Date) => string;
}): string {
  const when = input.renewsAt === null ? null : input.formatDate(input.renewsAt);
  if (input.status === 'canceled') return 'Your Pro subscription has ended.';
  if (input.status === 'unpaid') return 'Pro has stopped because a payment could not be taken.';
  if (input.status === 'past_due') return 'A payment could not be taken. Pro carries on while we try again.';
  if (input.cancelAtPeriodEnd) {
    return when === null ? 'Pro ends when this period does.' : `Pro ends on ${when} and will not renew.`;
  }
  const every = input.interval === 'year' ? 'every year' : 'every month';
  return when === null ? `Pro renews ${every}.` : `Pro renews ${every}, next on ${when}.`;
}
