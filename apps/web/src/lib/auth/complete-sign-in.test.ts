import type { AccessContext, AccessMembership } from '@repo/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const single = vi.fn();
const upsert = vi.fn();
const getUser = vi.fn();
const getAccessContext = vi.fn<() => Promise<AccessContext>>();
const readInvitation = vi.fn<() => Promise<string | null>>();
const forgetInvitation = vi.fn<() => Promise<void>>();
const takePendingBooking = vi.fn<() => Promise<unknown>>();

const from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }), upsert }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ auth: { getUser }, rpc, from }) }));
vi.mock('@repo/db', () => ({ getAccessContext: () => getAccessContext() }));
vi.mock('./invitation-cookie', () => ({ readInvitation: () => readInvitation(), forgetInvitation: () => forgetInvitation() }));
vi.mock('@/lib/booking/pending', () => ({ takePendingBooking: () => takePendingBooking() }));

const { completeSignIn } = await import('./complete-sign-in');

const nobody: AccessContext = { userId: 'user-1', staffRole: null, isLearner: false, learnerOnboarded: false, memberships: [], suspendedBusinesses: [] };
const schoolInstructor: AccessMembership = {
  businessId: 'school-1',
  businessName: 'Northern Lights Driving',
  businessType: 'school',
  role: 'instructor',
  instructorProfileId: 'profile-1',
  onboarding: { step: 1, completed: false },
  businessOnboarded: true,
};

/** What invitation_details says about the remembered link. */
function invitationIs(details: { kind: 'learner' | 'member'; expired: boolean } | null) {
  rpc.mockImplementation((name: string) =>
    name === 'invitation_details'
      ? { maybeSingle: () => Promise.resolve({ data: details, error: null }) }
      : Promise.resolve({ data: null, error: null }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: {}, phone_confirmed_at: '2026-09-16T09:00:00Z' } } });
  single.mockResolvedValue({ data: { intended_role: 'instructor', full_name: 'Nia Newcomer' } });
  readInvitation.mockResolvedValue(null);
  takePendingBooking.mockResolvedValue(null);
  invitationIs(null);
});

describe('finishing sign-up with an invitation to teach for a school (AUTH-05, M5-11)', () => {
  it('joins the school instead of making the instructor a Business of their own', async () => {
    readInvitation.mockResolvedValue('tok_school');
    invitationIs({ kind: 'member', expired: false });
    getAccessContext.mockResolvedValueOnce(nobody).mockResolvedValue({ ...nobody, memberships: [schoolInstructor] });

    expect(await completeSignIn()).toBe('/onboarding');
    expect(rpc).toHaveBeenCalledWith('accept_member_invitation', { p_token: 'tok_school' });
    expect(rpc).not.toHaveBeenCalledWith('create_business', expect.anything());
    expect(forgetInvitation).toHaveBeenCalled();
  });

  it('makes no Business of one when the link stopped working meanwhile, so they choose for themselves', async () => {
    readInvitation.mockResolvedValue('tok_school');
    invitationIs({ kind: 'member', expired: true });
    getAccessContext.mockResolvedValue(nobody);

    expect(await completeSignIn()).toBe('/start');
    expect(rpc).not.toHaveBeenCalledWith('accept_member_invitation', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('create_business', expect.anything());
  });

  it('sends an instructor who joined without a verified mobile to verify it first (AUTH-02)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: {}, phone_confirmed_at: null } } });
    readInvitation.mockResolvedValue('tok_school');
    invitationIs({ kind: 'member', expired: false });
    getAccessContext.mockResolvedValueOnce(nobody).mockResolvedValue({ ...nobody, memberships: [schoolInstructor] });

    expect(await completeSignIn()).toBe('/verify-phone?next=%2Fonboarding');
  });
});

describe('finishing sign-up with a learner invitation (AUTH-07)', () => {
  it('keeps the invitation while somebody has still to say what they are here as', async () => {
    single.mockResolvedValue({ data: { intended_role: null, full_name: '' } });
    readInvitation.mockResolvedValue('tok_learner');
    invitationIs({ kind: 'learner', expired: false });
    getAccessContext.mockResolvedValue(nobody);

    expect(await completeSignIn()).toBe('/start');
    expect(rpc).not.toHaveBeenCalledWith('accept_invitation', expect.anything());
    expect(forgetInvitation).not.toHaveBeenCalled();
  });

  it('accepts it once they are a learner, and lets it go', async () => {
    single.mockResolvedValue({ data: { intended_role: 'learner', full_name: 'Priya Patel' } });
    readInvitation.mockResolvedValue('tok_learner');
    invitationIs({ kind: 'learner', expired: false });
    const learner = { ...nobody, isLearner: true, learnerOnboarded: false };
    getAccessContext.mockResolvedValueOnce(nobody).mockResolvedValue(learner);

    expect(await completeSignIn()).toBe('/onboarding/about-you');
    expect(upsert).toHaveBeenCalledWith({ user_id: 'user-1' }, { onConflict: 'user_id', ignoreDuplicates: true });
    expect(rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'tok_learner' });
    expect(forgetInvitation).toHaveBeenCalled();
  });

  it('sets up an instructor who signed up with no invitation as before', async () => {
    const independent: AccessMembership = { ...schoolInstructor, businessId: 'biz-1', businessType: 'independent', role: 'owner' };
    getAccessContext.mockResolvedValueOnce(nobody).mockResolvedValue({ ...nobody, memberships: [independent] });

    expect(await completeSignIn()).toBe('/onboarding');
    expect(rpc).toHaveBeenCalledWith('create_business', { p_type: 'independent', p_name: 'Nia Newcomer' });
    expect(forgetInvitation).not.toHaveBeenCalled();
  });
});
