import { beforeEach, describe, expect, it, vi } from 'vitest';

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirected to ${path}`);
  }
}

const rpc = vi.fn();
const getAccess = vi.fn<() => Promise<unknown>>();
const completeSignIn = vi.fn<() => Promise<string>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess() }));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => completeSignIn() }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw new Redirected(path);
  },
}));

const { acceptInvitation, acceptMemberInvitation } = await import('./actions');

const signedIn = { session: { userId: 'user-1' }, access: { isLearner: false, memberships: [] } };

beforeEach(() => {
  vi.clearAllMocks();
  getAccess.mockResolvedValue(signedIn);
  rpc.mockResolvedValue({ data: 'school-1', error: null });
  completeSignIn.mockResolvedValue('/verify-phone?next=%2Fonboarding');
});

describe('joining a school from its link (AUTH-05, M5-11)', () => {
  it('joins, then carries on as a new instructor would: mobile first, then onboarding', async () => {
    await expect(acceptMemberInvitation('tok_abc-123')).rejects.toMatchObject({ path: '/verify-phone?next=%2Fonboarding' });
    expect(rpc).toHaveBeenCalledWith('accept_member_invitation', { p_token: 'tok_abc-123' });
  });

  it('says why an account that teaches elsewhere cannot join, and that a used link is spent', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "teaches_elsewhere"}' } });
    expect(await acceptMemberInvitation('tok_abc-123')).toEqual({
      ok: false,
      code: 'NOT_ALLOWED',
      message: 'This account already teaches for another driving business. To join the school, sign out and create an account with a different email.',
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "token", "reason": "expired"}' } });
    expect(await acceptMemberInvitation('tok_abc-123')).toMatchObject({ code: 'NOT_FOUND', message: 'This link has already been used or has expired.' });
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it('needs a token and somebody signed in', async () => {
    expect(await acceptMemberInvitation('')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    getAccess.mockResolvedValueOnce(null);
    expect(await acceptMemberInvitation('tok_abc-123')).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('a learner accepting an instructor (AUTH-07)', () => {
  it('is for learners only', async () => {
    expect(await acceptInvitation('tok_abc-123')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    getAccess.mockResolvedValueOnce({ ...signedIn, access: { isLearner: true, memberships: [] } });
    await expect(acceptInvitation('tok_abc-123')).rejects.toMatchObject({ path: '/app/learner' });
    expect(rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'tok_abc-123' });
  });
});
