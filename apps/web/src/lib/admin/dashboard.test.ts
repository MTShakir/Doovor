import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { platformDashboard } = await import('./dashboard');

// Half past midnight in London on Tuesday 18 August 2026, which is still the 17th in UTC.
const facts = {
  from: '2026-08-17T23:30:00+00:00',
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
  it('reads the figures the database works out, and names the 30 days they cover in London', async () => {
    rpc.mockResolvedValueOnce({ data: facts, error: null });
    const dashboard = await platformDashboard();

    expect(rpc).toHaveBeenCalledWith('platform_dashboard');
    expect(dashboard).toEqual({
      range: 'Tue 18 Aug to Thu 17 Sep',
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
    await expect(platformDashboard()).rejects.toThrow('Could not read the platform dashboard: NOT_ALLOWED');
  });

  it('refuses figures that are not the shape it expects', async () => {
    rpc.mockResolvedValueOnce({ data: { ...facts, money: { gmv_pence: '2950000' } }, error: null });
    await expect(platformDashboard()).rejects.toThrow();
  });
});
