import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const adminPerson = vi.fn<(id: string) => Promise<unknown>>();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/admin/people', () => ({ adminPerson: (id: string) => adminPerson(id) }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { openPerson, reactivateAccount, resetTwoStep, suspendAccount } = await import('./person-actions');

const userId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'super_admin' } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('opening a person (ADM-02, M5-18)', () => {
  it('reads them for staff, and says when there is nobody there', async () => {
    adminPerson.mockResolvedValueOnce({ userId, name: 'Lee One' });
    expect(await openPerson({ userId })).toEqual({ ok: true, data: { userId, name: 'Lee One' } });
    expect(requirePortal).toHaveBeenCalled();

    adminPerson.mockResolvedValueOnce(null);
    expect(await openPerson({ userId })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await openPerson({ userId: 'lee' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('suspending and reactivating an account (ADM-02, M5-18)', () => {
  it('suspends with the reason given, and has the lists read again', async () => {
    expect(await suspendAccount({ userId, reason: ' Abusive messages ' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_account_suspended', { p_user_id: userId, p_suspended: true, p_reason: 'Abusive messages' });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/learners');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/instructors');
  });

  it('will not suspend without a reason', async () => {
    expect(await suspendAccount({ userId, reason: '' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { reason: 'Say why, so whoever looks at it next knows' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reactivates', async () => {
    expect(await reactivateAccount({ userId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_account_suspended', { p_user_id: userId, p_suspended: false });
  });

  it('says in words why the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "yourself"}' } });
    expect(await suspendAccount({ userId, reason: 'Testing' })).toMatchObject({ ok: false, message: 'That is your own account. Ask another super admin.' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "staff"}' } });
    expect(await suspendAccount({ userId, reason: 'Testing' })).toMatchObject({ ok: false, message: 'Platform staff are not suspended from here.' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await reactivateAccount({ userId })).toMatchObject({ ok: false, code: 'NOT_ALLOWED', message: 'You do not have permission to do that.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('resetting two-step verification (ADM-02, AUTH-08, M5-18)', () => {
  it('resets it, or says there is nothing to reset', async () => {
    expect(await resetTwoStep({ userId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_reset_two_step', { p_user_id: userId });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "no_two_step"}' } });
    expect(await resetTwoStep({ userId })).toMatchObject({ ok: false, message: 'They do not have two-step verification on.' });
    expect(await resetTwoStep({ userId: 'ben' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
