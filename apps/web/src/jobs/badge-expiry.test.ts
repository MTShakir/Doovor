import { describe, expect, it, vi } from 'vitest';
import { sweepBadges, type BadgeStore, type DueReminder } from './badge-expiry';

const today = '2026-09-12';

const soon: DueReminder = {
  instructorId: '11111111-1111-4111-8111-111111111111',
  businessId: '22222222-2222-4222-8222-222222222222',
  badgeExpiry: '2026-09-17',
  daysBefore: 7,
  daysLeft: 5,
};

function fakeStore(due: DueReminder[], expired = 0) {
  const asked: string[] = [];
  const store: BadgeStore = {
    claimReminders: (day) => {
      asked.push(day);
      return Promise.resolve(due);
    },
    unlistExpired: (day) => {
      asked.push(day);
      return Promise.resolve(expired);
    },
  };
  return { store, asked };
}

describe('badge expiry sweep (INS-03, M1-13)', () => {
  it('warns about what the database claimed, and says how long is left', async () => {
    const { store, asked } = fakeStore([soon], 2);
    const send = vi.fn(() => Promise.resolve());

    const result = await sweepBadges(store, send, today);

    expect(send).toHaveBeenCalledWith([
      {
        instructorId: soon.instructorId,
        businessId: soon.businessId,
        daysBefore: 7,
        summary: 'Your instructor badge expires in 5 days',
      },
    ]);
    expect(result).toEqual({ reminded: 1, unlisted: 2 });
    // Every question is asked about the same day, so a run at midnight cannot straddle two.
    expect(asked).toEqual([today, today]);
  });

  it('still hides expired badges on a day with nothing to warn about', async () => {
    const { store } = fakeStore([], 1);
    const send = vi.fn(() => Promise.resolve());

    expect(await sweepBadges(store, send, today)).toEqual({ reminded: 0, unlisted: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it('runs against whatever day it is given, so the rules can be checked at a fixed one', async () => {
    const { store, asked } = fakeStore([{ ...soon, badgeExpiry: '2027-01-01', daysBefore: 60, daysLeft: 60 }]);
    const send = vi.fn(() => Promise.resolve());

    await sweepBadges(store, send, '2026-11-02');

    expect(asked).toEqual(['2026-11-02', '2026-11-02']);
    expect(send).toHaveBeenCalledWith([expect.objectContaining({ summary: 'Your instructor badge expires in 60 days' })]);
  });
});
