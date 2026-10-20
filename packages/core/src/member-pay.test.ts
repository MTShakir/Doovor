import { describe, expect, it } from 'vitest';
import { memberPaySchema, mondayOfWeek, payWords } from './member-pay.ts';

const membershipId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';

describe('what a school pays an instructor teaching under it (M9-21, D-291)', () => {
  it('takes a rate an hour in pounds, or a share of each lesson in per cent', () => {
    expect(memberPaySchema.parse({ membershipId, basis: 'hourly', hourly: '18.50' })).toEqual({
      membershipId,
      basis: 'hourly',
      hourlyPence: 1850,
      sharePercent: null,
      fromMonday: null,
    });
    expect(memberPaySchema.parse({ membershipId, basis: 'share', share: '60' })).toEqual({
      membershipId,
      basis: 'share',
      hourlyPence: null,
      sharePercent: 60,
      fromMonday: null,
    });
    expect(memberPaySchema.parse({ membershipId, basis: '' })).toEqual({ membershipId, basis: null, hourlyPence: null, sharePercent: null, fromMonday: null });
  });

  it('starts from the Monday of the week chosen', () => {
    expect(memberPaySchema.parse({ membershipId, basis: 'hourly', hourly: '18', from: '2026-10-15' }).fromMonday).toBe('2026-10-12');
    expect(mondayOfWeek('2026-10-12')).toBe('2026-10-12');
    expect(mondayOfWeek('2026-10-18')).toBe('2026-10-12');
  });

  it('says what is wrong beside the box it is about', () => {
    const rate = memberPaySchema.safeParse({ membershipId, basis: 'hourly', hourly: '0.50' });
    expect(rate.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([['hourly', 'Enter a rate between £1 and £200 an hour']]);
    const share = memberPaySchema.safeParse({ membershipId, basis: 'share', share: '120' });
    expect(share.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([['share', 'Enter a share between 1 and 100 per cent']]);
    expect(memberPaySchema.safeParse({ membershipId, basis: 'share', share: '6.5' }).success).toBe(false);
    expect(memberPaySchema.safeParse({ membershipId, basis: 'hourly', hourly: '18', from: '2026-02-30' }).error?.issues[0]?.message).toBe('Enter a date');
  });

  it('says the pay in words', () => {
    expect(payWords('hourly', 1800, null)).toBe('£18 an hour');
    expect(payWords('share', null, 60)).toBe('60% of each lesson');
    expect(payWords(null, null, null)).toBe('No pay set');
  });
});
