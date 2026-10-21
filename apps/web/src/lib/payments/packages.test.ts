import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));

const { packageOffer } = await import('./packages');

/** A package as the database has it, sold by a Business in the given standing. */
function soldBy(status: string) {
  maybeSingle.mockResolvedValue({
    data: {
      id: 'package-1',
      business_id: 'business-1',
      name: '10 hours',
      minutes: 600,
      price_pence: 40000,
      expiry_days: 365,
      is_active: true,
      businesses: { name: 'Sam Driving', status, stripe_account_id: 'acct_1', stripe_charges_enabled: true },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('who sells hours (PAY-04, ADM-02, D-292)', () => {
  it('is a Business in good standing', async () => {
    soldBy('active');
    expect(await packageOffer('package-1')).toMatchObject({ businessName: 'Sam Driving', accountId: 'acct_1', onSale: true, suspended: false });
  });

  it('is never one that is suspended, or paused while its instructor teaches under a school (D-327)', async () => {
    soldBy('suspended');
    expect(await packageOffer('package-1')).toMatchObject({ suspended: true });
    soldBy('paused');
    expect(await packageOffer('package-1')).toMatchObject({ suspended: true });
  });
});
