import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const completeSignIn = vi.fn<() => Promise<string>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { verifyOtp, exchangeCodeForSession, getUser } }),
}));
vi.mock('@/lib/auth/complete-sign-in', () => ({ completeSignIn: () => completeSignIn() }));

const { GET } = await import('./route');

/** Where the link sends them, as a path and its query. */
async function follow(query: string): Promise<string> {
  const answer = await GET(new NextRequest(`https://app.example.com/auth/confirm?${query}`));
  const to = new URL(answer.headers.get('location') ?? '');
  return `${to.pathname}${to.search}`;
}

/** The account the link signed them in to, made by its own sign-up unless said otherwise. */
function accountIs(metadata: Record<string, unknown>) {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: metadata } }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockResolvedValue({ error: null });
  completeSignIn.mockResolvedValue('/app/learner');
  accountIs({ full_name: 'Erin Enquiry', intended_role: 'learner', terms_version: '2026-10-01' });
});

describe('an email link (AUTH-01, LRN-03, D-068, D-331)', () => {
  it('confirms a sign-up, or signs in, and carries on as any sign-in does', async () => {
    expect(await follow('token_hash=abc&type=email')).toBe('/app/learner');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc' });
    expect(await follow('code=xyz')).toBe('/app/learner');
  });

  it('asks for a password while the account is still the one made for them, by any link', async () => {
    accountIs({ full_name: 'Erin Enquiry', intended_role: 'learner', made_for_them: true });
    expect(await follow('token_hash=abc&type=email')).toBe('/account/password?claimed=1');
    expect(await follow('code=xyz')).toBe('/account/password?claimed=1');
    expect(completeSignIn).not.toHaveBeenCalled();

    // Once they have chosen one, a link signs them in like anybody else.
    accountIs({ full_name: 'Erin Enquiry', intended_role: 'learner', made_for_them: false });
    expect(await follow('token_hash=abc&type=email')).toBe('/app/learner');
  });

  it('sends a password reset to choose a new one', async () => {
    expect(await follow('token_hash=abc&type=recovery')).toBe('/account/password');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('sends a link that does not work back to sign in', async () => {
    verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
    expect(await follow('token_hash=abc&type=email')).toBe('/sign-in?error=link');
    expect(await follow('type=email')).toBe('/sign-in?error=link');
  });
});
