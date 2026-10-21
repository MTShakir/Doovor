import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const updateUser = vi.fn();
const redirectTo = vi.fn<(path: string) => void>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ auth: { getUser, updateUser } }) }));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => Promise.resolve('/app/learner') }));
vi.mock('@/lib/redirect-to', () => ({ redirectTo: (path: string) => { redirectTo(path); } }));

const { updatePassword } = await import('./actions');

/** Who is choosing a password: an account made for them, or one they made themselves. */
function accountIs(metadata: Record<string, unknown>) {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: metadata } }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ data: {}, error: null });
  accountIs({ full_name: 'Erin Enquiry', terms_version: '2026-10-01' });
});

describe('choosing a password (AUTH-01, D-331)', () => {
  it('sets it, and carries on as signing in does', async () => {
    await updatePassword({ password: 'a long pass phrase' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'a long pass phrase' });
    expect(redirectTo).toHaveBeenCalledWith('/app/learner');
  });

  it('takes away the mark of an account made for them, so no link asks again', async () => {
    accountIs({ full_name: 'Erin Enquiry', intended_role: 'learner', made_for_them: true });
    await updatePassword({ password: 'a long pass phrase' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'a long pass phrase', data: { made_for_them: false } });
  });

  it('says what to fix, and what Supabase refused', async () => {
    expect(await updatePassword({ password: 'short' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(updateUser).not.toHaveBeenCalled();
    updateUser.mockResolvedValue({ data: {}, error: { code: 'same_password' } });
    expect(await updatePassword({ password: 'a long pass phrase' })).toMatchObject({ ok: false });
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
