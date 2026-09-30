import { plans } from '@repo/config/plans';
import { describe, expect, it } from 'vitest';
import {
  bankedMonthsCreditPence,
  billingIntervals,
  isBillingInterval,
  monthsCovered,
  proListPricePence,
  remindByText,
  renewalNoticeDays,
  renewalNoticeDue,
  subscriptionCarriesPro,
  subscriptionDiscountPercent,
  subscriptionPricePence,
  subscriptionWords,
  type SubscriptionStatus,
} from './subscription.ts';

const at = (iso: string) => new Date(iso);
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

describe('what Pro costs (9.18, D-231)', () => {
  it('takes its price from the plan and nowhere else', () => {
    expect(proListPricePence('month')).toBe(plans.pro.monthlyPricePence);
    expect(proListPricePence('year')).toBe(plans.pro.yearlyPricePence);
  });

  it('is the list price for somebody who has just joined', () => {
    expect(subscriptionPricePence({ interval: 'month', monthsPaidInARow: 0 })).toBe(plans.pro.monthlyPricePence);
    expect(subscriptionPricePence({ interval: 'year', monthsPaidInARow: 0 })).toBe(plans.pro.yearlyPricePence);
  });

  it('takes the loyalty discount off, in the same steps the promise uses (D-206)', () => {
    // Three months in: 5% off. Eighteen months in: 30%, and no further.
    expect(subscriptionDiscountPercent(2)).toBe(0);
    expect(subscriptionDiscountPercent(3)).toBe(5);
    expect(subscriptionDiscountPercent(18)).toBe(30);
    expect(subscriptionDiscountPercent(120)).toBe(30);

    expect(subscriptionPricePence({ interval: 'month', monthsPaidInARow: 3 })).toBe(1140);
    expect(subscriptionPricePence({ interval: 'month', monthsPaidInARow: 18 })).toBe(840);
    expect(subscriptionPricePence({ interval: 'year', monthsPaidInARow: 18 })).toBe(8400);
  });

  it('never charges more than the list price, whatever it is told', () => {
    for (const interval of billingIntervals) {
      for (const months of [-5, 0, 1, 7, 19, 1000]) {
        const price = subscriptionPricePence({ interval, monthsPaidInARow: months });
        expect(price).toBeLessThanOrEqual(proListPricePence(interval));
        expect(price).toBeGreaterThan(0);
        expect(Number.isInteger(price)).toBe(true);
      }
    }
  });

  it('counts a year as twelve months of paying', () => {
    expect(monthsCovered('year')).toBe(12);
    expect(monthsCovered('month')).toBe(1);
  });

  it('knows an interval when it sees one, and refuses anything else', () => {
    expect(isBillingInterval('month')).toBe(true);
    expect(isBillingInterval('year')).toBe(true);
    for (const wrong of ['week', 'MONTH', '', null, 12, {}]) expect(isBillingInterval(wrong)).toBe(false);
  });
});

describe('a month earned by referring somebody (D-205, D-231)', () => {
  it('is worth a month at the monthly price, whichever way they are billed', () => {
    expect(bankedMonthsCreditPence(1)).toBe(plans.pro.monthlyPricePence);
    expect(bankedMonthsCreditPence(3)).toBe(plans.pro.monthlyPricePence * 3);
  });

  it('is nothing for nothing, and never a negative credit', () => {
    for (const months of [0, -1, -12, Number.NaN]) expect(bankedMonthsCreditPence(months)).toBe(0);
  });

  it('counts whole months only', () => {
    expect(bankedMonthsCreditPence(2.9)).toBe(plans.pro.monthlyPricePence * 2);
  });
});

describe('telling somebody before it renews (D-231)', () => {
  const renewsAt = at('2026-10-15T09:00:00Z');

  it('gives a fortnight on a year and three days on a month', () => {
    expect(renewalNoticeDays.year).toBe(14);
    expect(renewalNoticeDays.month).toBe(3);
  });

  it('texts about a yearly renewal and only emails about a monthly one', () => {
    expect(remindByText('year')).toBe(true);
    expect(remindByText('month')).toBe(false);
  });

  it('is due inside the window and not before it', () => {
    const due = (interval: 'month' | 'year', now: string) =>
      renewalNoticeDue({ interval, renewsAt, now: at(now), cancelAtPeriodEnd: false });

    // A fortnight before 15 October is 1 October, to the minute.
    expect(due('year', '2026-10-01T09:00:00Z')).toBe(true);
    expect(due('year', '2026-10-01T08:59:00Z')).toBe(false);
    expect(due('month', '2026-10-12T09:00:00Z')).toBe(true);
    expect(due('month', '2026-10-11T09:00:00Z')).toBe(false);
  });

  it('says nothing once the moment has passed', () => {
    expect(renewalNoticeDue({ interval: 'year', renewsAt, now: renewsAt, cancelAtPeriodEnd: false })).toBe(false);
    expect(
      renewalNoticeDue({ interval: 'year', renewsAt, now: at('2026-10-16T09:00:00Z'), cancelAtPeriodEnd: false }),
    ).toBe(false);
  });

  it('says nothing about a renewal that is not coming', () => {
    // Warning somebody about a charge they have already cancelled is how a cancellation gets
    // made twice, and the second one is a complaint.
    expect(
      renewalNoticeDue({ interval: 'year', renewsAt, now: at('2026-10-10T09:00:00Z'), cancelAtPeriodEnd: true }),
    ).toBe(false);
  });
});

describe('whether a subscription carries Pro', () => {
  it('carries it while it is being paid for, and while a payment is being retried', () => {
    for (const status of ['trialing', 'active', 'past_due'] as SubscriptionStatus[]) {
      expect(subscriptionCarriesPro(status)).toBe(true);
    }
  });

  it('does not carry it before it starts or after it stops', () => {
    for (const status of ['incomplete', 'canceled', 'unpaid'] as SubscriptionStatus[]) {
      expect(subscriptionCarriesPro(status)).toBe(false);
    }
  });
});

describe('what the plan screen says', () => {
  const renewsAt = at('2026-10-15T09:00:00Z');
  const words = (over: Partial<Parameters<typeof subscriptionWords>[0]>) =>
    subscriptionWords({ status: 'active', interval: 'month', renewsAt, cancelAtPeriodEnd: false, formatDate, ...over });

  it('says when it renews, and how often', () => {
    expect(words({})).toBe('Pro renews every month, next on 2026-10-15.');
    expect(words({ interval: 'year' })).toBe('Pro renews every year, next on 2026-10-15.');
  });

  it('says when it ends instead, once somebody has cancelled', () => {
    expect(words({ cancelAtPeriodEnd: true })).toBe('Pro ends on 2026-10-15 and will not renew.');
  });

  it('says a payment failed without taking Pro away', () => {
    expect(words({ status: 'past_due' })).toBe('A payment could not be taken. Pro carries on while we try again.');
    expect(words({ status: 'unpaid' })).toBe('Pro has stopped because a payment could not be taken.');
    expect(words({ status: 'canceled' })).toBe('Your Pro subscription has ended.');
  });
});
