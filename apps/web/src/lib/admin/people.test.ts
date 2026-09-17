import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { adminPerson, findInstructors, findLearners } = await import('./people');

const person = {
  user_id: 'user-1',
  name: 'Lee One',
  email: 'lee@example.com',
  phone: '447700900123',
  created_at: '2026-03-02T10:00:00+00:00',
  last_sign_in_at: '2026-09-15T13:30:00+00:00',
  two_step: false,
  staff_role: null,
  // Twenty to one in the morning in London, which is still the 14th in UTC.
  suspension: { at: '2026-09-14T23:40:00+00:00', reason: 'Abusive messages', by_name: 'Sue Super' },
  memberships: [{ business_id: 'business-1', business_name: 'Asha Driving', business_status: 'suspended', role: 'owner', active: true }],
  learns_with: [{ business_id: 'business-2', business_name: 'Quayside Driving School' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('people for platform staff (ADM-02, M5-18)', () => {
  it('finds instructors, with where they teach and their badge', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { user_id: 'user-9', instructor_id: 'profile-9', display_name: 'Ian', account_name: 'Ian One', email: 'ian@example.com', business_id: 'business-1', business_name: 'Bee School', verification_status: 'pending', suspended: false },
      ],
      error: null,
    });
    expect(await findInstructors('ian')).toEqual([
      { userId: 'user-9', name: 'Ian', email: 'ian@example.com', businessName: 'Bee School', verification: 'pending', suspended: false },
    ]);
    expect(rpc).toHaveBeenLastCalledWith('admin_instructors', { p_query: 'ian' });
  });

  it('finds learners, and the newest when nothing is typed', async () => {
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'user-1', name: 'Lee One', email: 'lee@example.com', businesses: 2, suspended: true }], error: null });
    expect(await findLearners('')).toEqual([{ userId: 'user-1', name: 'Lee One', email: 'lee@example.com', businesses: 2, suspended: true }]);
    expect(rpc).toHaveBeenLastCalledWith('admin_learners', {});
  });

  it('opens a person, with times in London and the mobile as people write it', async () => {
    rpc.mockResolvedValueOnce({ data: person, error: null });
    expect(await adminPerson('user-1')).toEqual({
      userId: 'user-1',
      name: 'Lee One',
      email: 'lee@example.com',
      phone: '07700 900123',
      joinedOn: 'Mon 2 Mar 2026',
      lastSignedIn: 'Tue 15 Sep, 14:30',
      twoStep: false,
      staffRole: null,
      suspension: { since: 'Tue 15 Sep', reason: 'Abusive messages', byName: 'Sue Super' },
      memberships: [{ businessId: 'business-1', businessName: 'Asha Driving', businessSuspended: true, role: 'owner', active: true }],
      learnsWith: [{ businessId: 'business-2', businessName: 'Quayside Driving School' }],
    });
    expect(rpc).toHaveBeenCalledWith('admin_person', { p_user_id: 'user-1' });
  });

  it('says never for somebody who has not signed in, and nothing for nobody', async () => {
    rpc.mockResolvedValueOnce({ data: { ...person, last_sign_in_at: null, phone: null, suspension: null }, error: null });
    expect(await adminPerson('user-1')).toMatchObject({ lastSignedIn: null, phone: null, suspension: null });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await adminPerson('user-9')).toBeNull();
  });

  it('fails loudly when the database refuses', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(findLearners('lee')).rejects.toThrow('Could not search learners: NOT_ALLOWED');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(findInstructors('ian')).rejects.toThrow('Could not search instructors: NOT_ALLOWED');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(adminPerson('user-1')).rejects.toThrow('Could not read the person: NOT_ALLOWED');
  });
});
