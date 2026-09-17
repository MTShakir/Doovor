import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const expireInstructorProfile = vi.fn<(id: string) => void>();
const requirePortal = vi.fn<() => Promise<unknown>>();

const chain = { select: () => chain, eq: () => chain, maybeSingle };
const from = vi.fn(() => chain);
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireInstructorProfile: (id: string) => { expireInstructorProfile(id); } }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));

const { cancelInvitation, changePermission, inviteToSchool, switchMember } = await import('./actions');

const school = { businessId: 'school-1', businessName: 'Quayside Driving School', businessType: 'school', role: 'manager' };
const membershipId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';
const invitationId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [school] } });
  rpc.mockReturnValue({ single: () => Promise.resolve({ data: { token: 'tok_1' }, error: null }) });
});

describe('inviting from the Instructors screen (SCH-02, M5-13)', () => {
  it('makes a link for the school the manager runs', async () => {
    expect(await inviteToSchool({ channel: 'link', fullName: 'Nia', email: '', phone: '' })).toEqual({
      ok: true,
      data: { link: 'https://app.example.test/invite/tok_1', schoolName: 'Quayside Driving School', fullName: 'Nia', email: null, phone: null },
    });
    expect(rpc).toHaveBeenCalledWith('invite_member', expect.objectContaining({ p_business_id: 'school-1', p_role: 'instructor', p_channel: 'link' }));
  });

  it('is only for somebody running a school', async () => {
    requirePortal.mockResolvedValueOnce({ access: { memberships: [{ ...school, role: 'instructor' }] } });
    expect(await inviteToSchool({ channel: 'link', fullName: '', email: '', phone: '' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cancels an invitation, and says when there is nothing left to cancel', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await cancelInvitation(invitationId)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('revoke_member_invitation', { p_invitation_id: invitationId });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "already_accepted"}' } });
    expect(await cancelInvitation(invitationId)).toMatchObject({ ok: false, message: 'They have already joined, so there is nothing to cancel.' });
    expect(await cancelInvitation('not-an-id')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('switching somebody off or on (SCH-02, M5-13)', () => {
  it('switches them, then has their public profile and the place pages read fresh', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    maybeSingle.mockResolvedValueOnce({ data: { business_id: 'school-1', user_id: 'user-9' } }).mockResolvedValueOnce({ data: { id: 'profile-9' } });

    expect(await switchMember({ membershipId, active: false })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_member_active', { p_membership_id: membershipId, p_active: false });
    expect(expireInstructorProfile).toHaveBeenCalledWith('profile-9');
  });

  it('says why somebody teaching elsewhere now cannot come back, and passes on a refusal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "teaches_elsewhere"}' } });
    expect(await switchMember({ membershipId, active: true })).toMatchObject({
      ok: false,
      message: 'They teach for another driving business now, so they cannot be switched back on here.',
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await switchMember({ membershipId, active: false })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(expireInstructorProfile).not.toHaveBeenCalled();
  });

  it('changes what a member may do, and says only the owner decides about revenue', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await changePermission({ membershipId, permission: 'set_own_prices', allowed: true })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_member_permission', { p_membership_id: membershipId, p_permission: 'set_own_prices', p_allowed: true });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await changePermission({ membershipId, permission: 'view_revenue', allowed: true })).toMatchObject({ ok: false, message: 'Only the owner decides that.' });
    expect(await changePermission({ membershipId, permission: 'manage_billing', allowed: true })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });
});
