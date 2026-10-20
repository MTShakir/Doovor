import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getAccess = vi.fn<() => Promise<unknown>>();
const expireAll = vi.fn<() => void>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess() }));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => Promise.resolve('/app/instructor') }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAll(); } }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw Object.assign(new Error('redirected'), { path });
  },
}));

const { reopenOwnBusiness } = await import('./actions');

const businessId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';

beforeEach(() => {
  vi.clearAllMocks();
  getAccess.mockResolvedValue({ access: { memberships: [] } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('opening a paused business again (M9-25, D-292)', () => {
  it('opens it, has the public pages read it fresh, and goes on to the instructor portal', async () => {
    await expect(reopenOwnBusiness(businessId)).rejects.toMatchObject({ path: '/app/instructor' });
    expect(rpc).toHaveBeenCalledWith('reopen_own_business', { p_business_id: businessId });
    expect(expireAll).toHaveBeenCalled();
  });

  it('says to wait while they still teach under a school', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "teaches_elsewhere"}' } });
    expect(await reopenOwnBusiness(businessId)).toMatchObject({ ok: false, message: expect.stringContaining('You still teach under a school') as unknown });
    expect(expireAll).not.toHaveBeenCalled();
  });

  it('refuses what is not a business, and somebody signed out', async () => {
    expect(await reopenOwnBusiness('nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    getAccess.mockResolvedValueOnce(null);
    expect(await reopenOwnBusiness(businessId)).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
