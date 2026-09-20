import { statsRange } from '@repo/core/stats-range';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { platformDashboard } = await import('./dashboard');

// The last 30 days up to Sunday 20 September 2026. London is an hour ahead of UTC in September,
// so the range begins at 23:00 the evening before its first day.
const range = statsRange('last_30_days', '2026-09-20');

const facts = {
  from: '2026-08-21T23:00:00+00:00',
  to: '2026-09-20T23:00:00+00:00',
  signups: { learners: 12, instructors: 3, schools: 1, undecided: 2 },
  businesses: { active: 40, independent: 36, schools: 4, suspended: 1, teaching: 31 },
  lessons: { booked: 812, completed: 640 },
  money: { gmv_pence: 2_950_000, card_pence: 2_100_000, fees_pence: 0, payments: 402, refunds_pence: 12_600 },
  verification: { waiting: 3, oldest: '2026-09-15T08:00:00+00:00' },
  disputes: { open: 0, oldest: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the platform dashboard (ADM-01, M5-17)', () => {
  it('asks for the days chosen, in London, and reads the figures the database works out', async () => {
    rpc.mockResolvedValueOnce({ data: facts, error: null });
    const dashboard = await platformDashboard(range);

    expect(rpc).toHaveBeenCalledWith('platform_dashboard', {
      p_from: '2026-08-21T23:00:00.000Z',
      p_to: '2026-09-20T23:00:00.000Z',
    });
    expect(dashboard).toEqual({
      range: 'Sat 22 Aug 2026 to Sun 20 Sep 2026',
      label: 'Last 30 days',
      signups: { learners: 12, instructors: 3, schools: 1, undecided: 2, total: 18 },
      businesses: { active: 40, independent: 36, schools: 4, suspended: 1, teaching: 31 },
      lessons: { booked: 812, completed: 640 },
      money: { gmvPence: 2_950_000, cardPence: 2_100_000, feesPence: 0, payments: 402, refundsPence: 12_600 },
      verification: { waiting: 3, oldestSince: 'Tue 15 Sep' },
      disputes: { open: 0, oldestSince: null },
    });
  });

  it('fails loudly rather than showing a quiet month when the figures cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(platformDashboard(range)).rejects.toThrow('Could not read the platform dashboard: NOT_ALLOWED');
  });

  it('refuses figures that are not the shape it expects', async () => {
    rpc.mockResolvedValueOnce({ data: { ...facts, money: { gmv_pence: '2950000' } }, error: null });
    await expect(platformDashboard(range)).rejects.toThrow();
  });
});
