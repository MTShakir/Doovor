import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const clientOptions = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const getAccessContext = vi.fn();
const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const viewingId = vi.fn<() => Promise<string | null>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (options: unknown) => {
    clientOptions(options);
    return Promise.resolve({ rpc });
  },
}));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@repo/db', () => ({ getAccessContext: (...args: unknown[]) => getAccessContext(...args) as unknown }));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ set: cookieSet, delete: cookieDelete }) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock('@/lib/auth/view-as', async (original) => ({ ...(await original<object>()), viewingId: () => viewingId() }));

const { startViewingAs, stopViewingAs } = await import('./view-as-actions');

const userId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
const viewing = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'support_admin' } });
  getAccessContext.mockResolvedValue({ userId, staffRole: null, isLearner: true, learnerOnboarded: true, memberships: [], suspendedBusinesses: [] });
});

describe('viewing as somebody (ADM-06, M5-21)', () => {
  it('starts from the staff member own requests, keeps the viewing in a cookie, and lands where the person would', async () => {
    rpc.mockResolvedValueOnce({ data: viewing, error: null });
    expect(await startViewingAs({ userId, reason: ' Cannot see his lessons ' })).toEqual({ ok: true, data: { path: '/app/learner' } });

    expect(requirePortal).toHaveBeenCalled();
    expect(clientOptions).toHaveBeenNthCalledWith(1, { asStaff: true });
    expect(rpc).toHaveBeenCalledWith('start_impersonation', { p_user_id: userId, p_reason: 'Cannot see his lessons' });
    expect(cookieSet).toHaveBeenCalledWith('view_as', viewing, expect.objectContaining({ path: '/', maxAge: 1800, sameSite: 'strict' }));
    // Where they land is read as them, with the viewing just started.
    expect(clientOptions).toHaveBeenNthCalledWith(2, { viewing });
    expect(getAccessContext).toHaveBeenCalledWith({ rpc }, userId);
  });

  it('asks why, and says why the database refused', async () => {
    expect(await startViewingAs({ userId, reason: '' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { reason: 'Say why you need to see what they see' },
    });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "staff"}' } });
    expect(await startViewingAs({ userId, reason: 'Checking' })).toMatchObject({ ok: false, message: 'Nobody views as a member of the platform staff.' });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('stops from the staff member own requests, forgets the viewing, and goes back to the admin portal', async () => {
    viewingId.mockResolvedValueOnce(viewing);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(stopViewingAs()).rejects.toThrow('REDIRECT /admin');
    expect(clientOptions).toHaveBeenCalledWith({ asStaff: true });
    expect(rpc).toHaveBeenCalledWith('end_impersonation', { p_session_id: viewing });
    expect(cookieDelete).toHaveBeenCalledWith('view_as');
  });
});
