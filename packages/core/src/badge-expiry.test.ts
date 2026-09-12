import { describe, expect, it } from 'vitest';
import { daysUntilExpiry, isBadgeExpired, reminderDue, reminderSummary } from './badge-expiry.ts';

const today = '2026-09-12';

describe('badge expiry (INS-03, M1-13)', () => {
  it('counts whole days, across a clock change', () => {
    // British Summer Time ends on 25 October 2026, inside this range.
    expect(daysUntilExpiry('2026-11-11', today)).toBe(60);
    expect(daysUntilExpiry('2026-09-12', today)).toBe(0);
    expect(daysUntilExpiry('2026-09-11', today)).toBe(-1);
  });

  it('treats the printed day as still valid', () => {
    expect(isBadgeExpired('2026-09-12', today)).toBe(false);
    expect(isBadgeExpired('2026-09-11', today)).toBe(true);
  });

  it('warns at two months, one month and one week', () => {
    expect(reminderDue('2026-11-11', today)).toBe(60);
    expect(reminderDue('2026-10-12', today)).toBe(30);
    expect(reminderDue('2026-09-19', today)).toBe(7);
    expect(reminderDue('2026-09-12', today)).toBe(7);
  });

  it('says nothing while the badge has plenty of time', () => {
    expect(reminderDue('2026-11-12', today)).toBeNull();
    expect(reminderDue('2027-09-12', today)).toBeNull();
  });

  it('says nothing once it has expired: that is not a reminder any more', () => {
    expect(reminderDue('2026-09-11', today)).toBeNull();
  });

  it('gives the nearest warning, not all of them, to someone who joins late', () => {
    expect(reminderDue('2026-09-17', today)).toBe(7);
  });

  it('says how long is left in words a person would use', () => {
    expect(reminderSummary('2026-11-11', today)).toBe('Your instructor badge expires in 60 days');
    expect(reminderSummary('2026-09-13', today)).toBe('Your instructor badge expires tomorrow');
    expect(reminderSummary('2026-09-12', today)).toBe('Your instructor badge expires today');
    expect(reminderSummary('2026-09-01', today)).toBe('Your instructor badge has expired');
  });
});
