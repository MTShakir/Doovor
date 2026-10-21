import { beforeEach, describe, expect, it, vi } from 'vitest';

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirected to ${path}`);
  }
}

const rpc = vi.fn();
const getAccess = vi.fn<() => Promise<unknown>>();
const completeSignIn = vi.fn<() => Promise<string>>();
const carryPhotoOver = vi.fn<(supabase: unknown, userId: string, schoolId: string) => Promise<void>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess() }));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => completeSignIn() }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => undefined }));
vi.mock('@/lib/school/carry-photo', () => ({ carryPhotoOver: (supabase: unknown, userId: string, schoolId: string) => carryPhotoOver(supabase, userId, schoolId) }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw new Redirected(path);
  },
}));

const { acceptInvitation, acceptLinkInvitation, acceptMemberInvitation } = await import('./actions');

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
    // Their photo comes with the rest of their profile (D-324).
    expect(carryPhotoOver).toHaveBeenCalledWith(expect.anything(), 'user-1', 'school-1');
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

    // D-292: a business of their own pauses only with nothing still owed to its learners.
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "lessons_to_come"}' } });
    expect(await acceptMemberInvitation('tok_abc-123')).toMatchObject({
      message: 'Your business has lessons still to come. Move or cancel them first, then join.',
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "credit_left"}' } });
    expect(await acceptMemberInvitation('tok_abc-123')).toMatchObject({
      message: 'Some of your learners have hours left to use. Teach or refund them first, then join.',
    });
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

describe('linking a business of their own to a school (D-282)', () => {
  it('links it, and goes to Your school', async () => {
    getAccess.mockResolvedValue({ access: { isLearner: false, memberships: [] } });
    rpc.mockResolvedValueOnce({ data: 'link-1', error: null });
    await expect(acceptLinkInvitation('tok_link')).rejects.toMatchObject({ path: '/app/instructor/school' });
    expect(rpc).toHaveBeenCalledWith('accept_link_invitation', { p_token: 'tok_link' });
  });

  it('says what stands in the way', async () => {
    getAccess.mockResolvedValue({ access: { isLearner: false, memberships: [] } });
    const refusal = (reason: string) => ({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: `{"reason": "${reason}"}` } });
    rpc.mockResolvedValueOnce(refusal('no_business'));
    expect(await acceptLinkInvitation('tok_link')).toMatchObject({ ok: false, message: 'Linking needs an instructor business of your own. Sign out and create an instructor account to link one.' });
    rpc.mockResolvedValueOnce(refusal('linked_elsewhere'));
    expect(await acceptLinkInvitation('tok_link')).toMatchObject({ ok: false, message: 'Your business is linked to another school. Leave it first, from Your school under More.' });
    rpc.mockResolvedValueOnce(refusal('member_here'));
    expect(await acceptLinkInvitation('tok_link')).toMatchObject({ ok: false, message: 'You already work for this school.' });
    rpc.mockResolvedValueOnce(refusal('expired'));
    expect(await acceptLinkInvitation('tok_link')).toMatchObject({ ok: false, message: 'This link has already been used or has expired.' });
  });

  it('asks somebody signed out to sign in', async () => {
    getAccess.mockResolvedValue(null);
    expect(await acceptLinkInvitation('tok_link')).toMatchObject({ ok: false, code: 'NOT_AUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
