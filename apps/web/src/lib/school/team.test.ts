import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { schoolTeam } = await import('./team');

const member = {
  membership_id: 'm-1',
  is_you: false,
  role: 'instructor',
  active: true,
  name: 'Emma Clarke',
  email: 'emma.clarke@example.com',
  phone: '+447700900002',
  instructor_id: 'p-1',
  photo_path: null,
  set_own_prices: true,
  view_revenue: false,
  lessons_to_come: 12,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a school's team (SCH-02, M5-13)", () => {
  it('reads the members and the invitations still waiting', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        members: [member],
        invitations: [{ invitation_id: 'i-1', full_name: 'Nia', email: null, phone: '+447700900555', expires_at: '2026-09-30T10:00:00+00:00' }],
      },
      error: null,
    });

    expect(await schoolTeam('school-1')).toEqual({
      members: [
        {
          membershipId: 'm-1',
          isYou: false,
          role: 'instructor',
          active: true,
          name: 'Emma Clarke',
          email: 'emma.clarke@example.com',
          phone: '+447700900002',
          instructorId: 'p-1',
          photoPath: null,
          setOwnPrices: true,
          viewRevenue: false,
          lessonsToCome: 12,
        },
      ],
      invitations: [
        { invitationId: 'i-1', fullName: 'Nia', email: null, phone: '+447700900555', expiresAt: '2026-09-30T10:00:00+00:00', expiresOn: 'Wed 30 Sep' },
      ],
    });
    expect(rpc).toHaveBeenCalledWith('school_team', { p_business_id: 'school-1' });
  });

  it('fails loudly rather than showing a school with nobody in it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(schoolTeam('school-1')).rejects.toThrow("Could not read the school's team: NOT_ALLOWED");
    rpc.mockResolvedValueOnce({ data: { members: [{ ...member, role: 'owner' }], invitations: [] }, error: null });
    await expect(schoolTeam('school-1')).rejects.toThrow();
  });
});
