import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const getAccount = vi.fn();
const requireAccess = vi.fn<() => Promise<unknown>>();

const chain = { select: () => chain, eq: () => chain, maybeSingle };
const from = vi.fn(() => chain);
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ from, rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requireAccess: () => requireAccess() }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ getAccount }) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));

const { paymentsState } = await import('./connect');

const business = { id: 'school-1', name: 'Quayside Driving School', settings: {}, stripe_charges_enabled: true };

function signedInAs(role: 'owner' | 'manager') {
  requireAccess.mockResolvedValue({ access: { memberships: [{ businessId: 'school-1', role, instructorProfileId: null }] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: business, error: null });
});

describe('the payments account on the Money screen (PAY-01, PRD 6.2, M5-16)', () => {
  it('tells a manager whether cards are taken, and nothing about the account or its payouts', async () => {
    signedInAs('manager');
    expect(await paymentsState()).toEqual({
      businessId: 'school-1',
      businessName: 'Quayside Driving School',
      canManage: false,
      chargesEnabled: true,
      paymentMode: expect.any(String) as string,
      account: null,
    });
    // Neither the owner's function nor the provider is asked on a manager's behalf (acceptance test 11).
    expect(rpc).not.toHaveBeenCalled();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('shows the owner the account, its payouts and what the provider still needs, writing back what changed', async () => {
    signedInAs('owner');
    rpc.mockImplementation((name: string) =>
      name === 'payments_account'
        ? { maybeSingle: () => Promise.resolve({ data: { account_id: 'acct_1', payouts_enabled: false, details_submitted: false }, error: null }) }
        : Promise.resolve({ data: null, error: null }),
    );
    getAccount.mockResolvedValueOnce({
      ok: true,
      data: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirements: ['external_account'] },
    });

    expect(await paymentsState()).toMatchObject({
      canManage: true,
      account: { accountId: 'acct_1', payoutsEnabled: true, detailsSubmitted: true, requirements: ['external_account'], stale: false },
    });
    expect(rpc).toHaveBeenCalledWith('payments_account', { p_business_id: 'school-1' });
    expect(rpc).toHaveBeenCalledWith('set_payments_state', {
      p_business_id: 'school-1',
      p_charges_enabled: true,
      p_payouts_enabled: true,
      p_details_submitted: true,
    });
  });

  it('says the owner may be looking at old news when the provider cannot be reached', async () => {
    signedInAs('owner');
    rpc.mockReturnValue({
      maybeSingle: () => Promise.resolve({ data: { account_id: 'acct_1', payouts_enabled: true, details_submitted: true }, error: null }),
    });
    getAccount.mockResolvedValueOnce({ ok: false });
    expect(await paymentsState()).toMatchObject({ account: { accountId: 'acct_1', stale: true } });
  });
});
