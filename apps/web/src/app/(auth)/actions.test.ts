import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const updateUser = vi.fn();
const signUpWith = vi.fn();
const rpc = vi.fn();
const upsert = vi.fn();
const redirectTo = vi.fn<(path: string) => void>();
const redirect = vi.fn<(path: string) => void>();
const readInvitation = vi.fn<() => Promise<string | null>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser, updateUser, signUp: signUpWith }, rpc, from: () => ({ upsert }) }),
}));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => Promise.resolve('/app/learner') }));
vi.mock('@/lib/redirect-to', () => ({ redirectTo: (path: string) => { redirectTo(path); } }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { redirect(path); } }));
vi.mock('@/lib/auth/invitation-cookie', () => ({ readInvitation: () => readInvitation() }));
vi.mock('@/lib/auth/referral-cookie', () => ({ readReferral: () => Promise.resolve(null), forgetReferral: () => Promise.resolve() }));

const { chooseRole, signUp, updatePassword } = await import('./actions');

/** Who is choosing a password: an account made for them, or one they made themselves. */
function accountIs(metadata: Record<string, unknown>) {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: metadata } }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ data: {}, error: null });
  signUpWith.mockResolvedValue({ data: {}, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  upsert.mockResolvedValue({ error: null });
  readInvitation.mockResolvedValue(null);
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

describe('where a new account came from (D-413)', () => {
  const person = { fullName: 'Ian Instructor', email: 'ian@example.com', password: 'a long pass phrase', role: 'instructor', acceptedTerms: true };

  /** What the sign-up sent with the account. */
  function sentWith(): Record<string, unknown> {
    const call = signUpWith.mock.calls[0]?.[0] as { options: { data: Record<string, unknown> } } | undefined;
    return call?.options.data ?? {};
  }

  it('sends the link’s tags and the answer with the account', async () => {
    await signUp({ ...person, arrival: { source: 'card', campaign: 'week1' }, heardAbout: 'print' });
    expect(sentWith()).toMatchObject({ arrival_source: 'card', arrival_campaign: 'week1', arrival_channel: 'print', heard_about: 'print' });
    expect(sentWith()).not.toHaveProperty('arrival_medium');
    expect(redirect).toHaveBeenCalledWith('/check-email');
  });

  it('sends nothing about it when nothing is known', async () => {
    await signUp(person);
    expect(Object.keys(sentWith()).filter((key) => key.startsWith('arrival_') || key.startsWith('heard_'))).toEqual([]);
  });

  it('says a learner invited by their instructor came from them, whatever the form said', async () => {
    readInvitation.mockResolvedValue('an-invitation');
    await signUp({ ...person, role: 'learner', heardAbout: 'instagram' });
    expect(sentWith()).toMatchObject({ heard_about: 'instructor' });
  });

  it('records it for somebody who came with Google, as they choose what they are', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    await chooseRole({ role: 'learner', arrival: { source: 'google', medium: 'search' }, heardAbout: 'search' });
    expect(rpc).toHaveBeenCalledWith('record_account_origin', {
      p_source: 'google',
      p_medium: 'search',
      p_campaign: '',
      p_channel: 'search',
      p_heard_about: 'search',
      p_heard_about_other: '',
    });
    expect(redirectTo).toHaveBeenCalledWith('/app/learner');
  });

  it('carries on whatever the database says about it, and asks nothing of it when there is nothing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'refused' } });
    await chooseRole({ role: 'learner', heardAbout: 'word_of_mouth' });
    expect(redirectTo).toHaveBeenCalledWith('/app/learner');
    rpc.mockClear();
    await chooseRole({ role: 'learner' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

