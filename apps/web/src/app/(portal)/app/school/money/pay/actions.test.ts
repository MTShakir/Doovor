import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));

const { saveMemberPay } = await import('./actions');

const membershipId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const owner = { businessId: 'school-1', businessType: 'school', role: 'owner' };

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [owner] } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('what the school pays an instructor teaching under it (M9-21, D-291)', () => {
  it('saves a rate an hour from the Monday of the week chosen', async () => {
    expect(await saveMemberPay({ membershipId, basis: 'hourly', hourly: '18', from: '2026-10-15' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_member_pay', {
      p_membership_id: membershipId,
      p_basis: 'hourly',
      p_hourly_pence: 1800,
      p_share_percent: undefined,
      p_from: '2026-10-12',
    });
  });

  it('saves a share from this week, or no pay at all', async () => {
    await saveMemberPay({ membershipId, basis: 'share', share: '60' });
    expect(rpc).toHaveBeenCalledWith('set_member_pay', {
      p_membership_id: membershipId,
      p_basis: 'share',
      p_hourly_pence: undefined,
      p_share_percent: 60,
      p_from: undefined,
    });
    await saveMemberPay({ membershipId, basis: '' });
    expect(rpc).toHaveBeenLastCalledWith('set_member_pay', {
      p_membership_id: membershipId,
      p_basis: undefined,
      p_hourly_pence: undefined,
      p_share_percent: undefined,
      p_from: undefined,
    });
  });

  it('puts what is wrong beside its box, and passes on a refusal', async () => {
    expect(await saveMemberPay({ membershipId, basis: 'hourly', hourly: '' })).toMatchObject({
      ok: false,
      fields: { hourly: 'Enter a rate between £1 and £200 an hour' },
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "from"}' } });
    expect(await saveMemberPay({ membershipId, basis: 'hourly', hourly: '18', from: '2020-01-06' })).toMatchObject({
      fields: { from: 'Choose a week from the last year, or next week' },
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await saveMemberPay({ membershipId, basis: 'hourly', hourly: '18' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('is for somebody running a school', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...owner, role: 'instructor' }] } });
    expect(await saveMemberPay({ membershipId, basis: 'hourly', hourly: '18' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
