import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { instructorStats, statsDays, statsSpanFrom } = await import('./dashboard');

// A Thursday in September 2026, when London is an hour ahead of UTC.
const now = new Date('2026-09-17T09:00:00Z');

const facts = {
  days: [
    { day: '2026-09-14', card_pence: 4200, cash_pence: 0, bank_pence: 0, credit_pence: 0 },
    { day: '2026-09-15', card_pence: 0, cash_pence: 6300, bank_pence: 0, credit_pence: 4200 },
  ],
  earned_pence: 14_700,
  minutes: 270,
  learners: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('how an instructor is doing (MNY-01, D-177)', () => {
  it('counts a week from its Monday to its Sunday', () => {
    expect(statsDays('week', '2026-09-17')).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('counts a month from the first up to today, not to the end of it', () => {
    expect(statsDays('month', '2026-09-17')).toEqual({ from: '2026-09-01', to: '2026-09-17' });
  });

  it('reads the span from the address, and calls anything else this week', () => {
    expect(statsSpanFrom('month')).toBe('month');
    expect(statsSpanFrom(undefined)).toBe('week');
    expect(statsSpanFrom('fortnight')).toBe('week');
  });

  it('asks over those days in London, and adds each day up', async () => {
    rpc.mockResolvedValueOnce({ data: facts, error: null });
    const stats = await instructorStats('week', now);

    expect(rpc).toHaveBeenCalledWith('instructor_dashboard', {
      p_from: '2026-09-13T23:00:00.000Z',
      p_to: '2026-09-20T23:00:00.000Z',
    });
    expect(stats?.label).toBe('This week');
    expect(stats?.earnedPence).toBe(14_700);
    expect(stats?.days[1]).toEqual({
      date: '2026-09-15',
      when: 'Tue 15 Sep 2026',
      cardPence: 0,
      cashPence: 6300,
      bankPence: 0,
      creditPence: 4200,
      totalPence: 10_500,
    });
    expect(stats?.minutes).toBe(270);
    expect(stats?.learners).toBe(3);
  });

  it('leaves Today standing when the figures cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await instructorStats('week', now)).toBeNull();

    rpc.mockResolvedValueOnce({ data: { days: 'none' }, error: null });
    expect(await instructorStats('week', now)).toBeNull();
  });
});
