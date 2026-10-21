import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const single = vi.fn();
const getAccess = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc, from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}));
vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess() }));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => Promise.resolve('/onboarding') }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw Object.assign(new Error('redirected'), { path });
  },
}));

const { startOwnBusiness } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  getAccess.mockResolvedValue({ session: { userId: 'user-1' }, access: { memberships: [], switchedOffBy: ['Quayside Driving School'] } });
  single.mockResolvedValue({ data: { full_name: 'Nia Newcomer' } });
  rpc.mockResolvedValue({ data: 'business-1', error: null });
});

describe('a business of their own, for somebody a school switched off (D-332)', () => {
  it('is made when they ask, in their name, and they go on to set it up', async () => {
    await expect(startOwnBusiness()).rejects.toMatchObject({ path: '/onboarding' });
    expect(rpc).toHaveBeenCalledWith('create_business', { p_type: 'independent', p_name: 'Nia Newcomer' });
  });

  it('passes on what the database refused, as for somebody who has one already', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "already_independent"}' } });
    expect(await startOwnBusiness()).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('is for somebody signed in', async () => {
    getAccess.mockResolvedValue(null);
    expect(await startOwnBusiness()).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
