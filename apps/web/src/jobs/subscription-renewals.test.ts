import { plans } from '@repo/config/plans';
import { describe, expect, it } from 'vitest';
import { renewalNotices, type RenewingSubscription } from './subscription-renewals';

/**
 * What somebody is told before Pro takes their money (9.18, D-237).
 *
 * Which subscriptions are due is the database's decision, so what is checked here is the part
 * this module owns: the words, the channels, and the key that stops a notice going twice.
 */

const base: RenewingSubscription = {
  businessId: 'b5f2a0c4-31d8-4a77-8a1f-2e9c0d5b7a13',
  ownerUserId: 'u5f2a0c4-31d8-4a77-8a1f-2e9c0d5b7a13',
  interval: 'year',
  renewsAt: new Date('2026-12-31T09:00:00Z'),
  monthsPaid: 0,
};

const only = (over: Partial<RenewingSubscription> = {}) => {
  const [notice] = renewalNotices([{ ...base, ...over }]);
  if (!notice) throw new Error('no notice was written');
  return notice;
};

describe('warning somebody before Pro renews (9.18, D-237)', () => {
  it('names the day, the amount and the way out', () => {
    const notice = only();

    expect(notice.detail).toContain('£120');
    expect(notice.detail).toContain('Thu 31 Dec 2026');
    expect(notice.detail).toContain('for another year');
    expect(notice.detail).toContain('You can stop it before then on your plan screen.');
  });

  it('says a month for a monthly one, and the monthly price', () => {
    const notice = only({ interval: 'month' });

    expect(notice.detail).toContain('£12');
    expect(notice.detail).toContain('for another month');
  });

  it('names what is actually coming out, not the list price (D-206)', () => {
    // Eighteen months paid in a row is the most the loyalty discount goes to, so the warning has
    // to say the discounted figure: naming £120 and taking £84 is the wrong way round.
    const notice = only({ monthsPaid: 18 });
    const list = plans.pro.yearlyPricePence;
    if (list === null) throw new Error('Pro has no yearly price');

    expect(notice.detail).not.toContain('£120');
    expect(notice.detail).toContain('£84');
  });

  it('texts about a year and does not about a month (NTF-01, D-237)', () => {
    expect(only({ interval: 'year' }).channels).toEqual(['in_app', 'push', 'email', 'sms']);
    expect(only({ interval: 'month' }).channels).toEqual(['in_app', 'push', 'email']);
  });

  it('always reaches the inbox, whichever interval it is', () => {
    for (const interval of ['month', 'year'] as const) {
      expect(only({ interval }).channels).toContain('in_app');
    }
  });

  it('writes one notice per renewal, not one per day inside the window', () => {
    // The same subscription seen on three days of its fortnight is one notice, because the day
    // it renews is what the key is made of rather than the day the job ran.
    const key = only().dedupeKey;
    expect(only().dedupeKey).toBe(key);
    expect(key).toContain('2026-12-31');

    // Next year's renewal is its own notice.
    expect(only({ renewsAt: new Date('2027-12-31T09:00:00Z') }).dedupeKey).not.toBe(key);
    // And so is another Business renewing on the same day.
    expect(only({ businessId: 'other' }).dedupeKey).not.toBe(key);
  });

  it('writes one for each of them, and none for none', () => {
    expect(renewalNotices([])).toEqual([]);
    expect(renewalNotices([base, { ...base, businessId: 'second' }])).toHaveLength(2);
  });
});
