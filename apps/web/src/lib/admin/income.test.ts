import { statsRange } from '@repo/core/stats-range';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { platformIncome } = await import('./income');

const range = statsRange('month', '2026-09-20');

const income = {
  fees: { pence: 4_700, payments: 96, on_pence: 470_000 },
  by_business: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Quayside Driving School', type: 'school', plan: 'school', pence: 4_200, payments: 84 },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Sarah Khan Driving', type: 'independent', plan: 'free', pence: 500, payments: 12 },
  ],
  plans: [
    { plan: 'free', businesses: 38 },
    { plan: 'pro', businesses: 4 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('what the platform earned (ADM-01, ADM-10, D-174)', () => {
  it('asks over the days chosen and reads the fees, who paid them and the plans', async () => {
    rpc.mockResolvedValueOnce({ data: income, error: null });
    const earned = await platformIncome(range);

    expect(rpc).toHaveBeenCalledWith('platform_income', {
      p_from: '2026-08-31T23:00:00.000Z',
      p_to: '2026-09-30T23:00:00.000Z',
    });
    expect(earned.fees).toEqual({ pence: 4_700, payments: 96, onPence: 470_000 });
    expect(earned.byBusiness[1]).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Sarah Khan Driving',
      kind: 'independent',
      plan: 'free',
      pence: 500,
      payments: 12,
    });
    expect(earned.plans).toEqual([
      { plan: 'free', businesses: 38 },
      { plan: 'pro', businesses: 4 },
    ]);
  });

  it('fails loudly rather than showing nothing earned', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(platformIncome(range)).rejects.toThrow('Could not read what the platform earned: NOT_ALLOWED');
  });

  it('refuses figures that are not the shape it expects', async () => {
    rpc.mockResolvedValueOnce({ data: { ...income, plans: [{ plan: 'gold', businesses: 1 }] }, error: null });
    await expect(platformIncome(range)).rejects.toThrow();
  });
});
