import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { adminBusiness, findBusinesses } = await import('./businesses');

const detail = {
  business_id: 'business-1',
  name: 'Asha Driving',
  type: 'independent',
  status: 'suspended',
  base_postcode: 'LS6 3HN',
  created_at: '2026-03-02T10:00:00+00:00',
  takes_cards: true,
  // Twenty to one in the morning in London, which is still the 14th in UTC.
  suspended_at: '2026-09-14T23:40:00+00:00',
  suspension_reason: 'Badge number belongs to somebody else',
  suspended_by_name: 'Sue Super',
  members: [
    { user_id: 'user-1', name: 'Asha Khan', email: null, phone: '+447700900123', role: 'owner', active: true, verification_status: 'approved' },
    { user_id: 'user-2', name: null, email: 'max@example.com', phone: null, role: 'manager', active: false, verification_status: null },
  ],
  learners: 12,
  lessons_to_come: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Businesses for platform staff (ADM-02, M5-18)', () => {
  it('searches with what was typed, and lists the newest when nothing was', async () => {
    rpc.mockResolvedValue({
      data: [
        { business_id: 'business-1', name: 'Asha Driving', type: 'independent', status: 'active', base_postcode: null, owner_name: 'Asha Khan', owner_email: 'asha@example.com', instructors: 1, created_at: '2026-03-02T10:00:00+00:00' },
      ],
      error: null,
    });
    expect(await findBusinesses('asha')).toEqual([
      { businessId: 'business-1', name: 'Asha Driving', type: 'independent', status: 'active', postcode: null, ownerName: 'Asha Khan', instructors: 1 },
    ]);
    expect(rpc).toHaveBeenLastCalledWith('admin_businesses', { p_query: 'asha' });

    await findBusinesses('');
    expect(rpc).toHaveBeenLastCalledWith('admin_businesses', {});
  });

  it('opens one, with its suspension in words and everybody who works there', async () => {
    rpc.mockResolvedValueOnce({ data: detail, error: null });
    expect(await adminBusiness('business-1')).toEqual({
      businessId: 'business-1',
      name: 'Asha Driving',
      type: 'independent',
      status: 'suspended',
      postcode: 'LS6 3HN',
      joinedOn: 'Mon 2 Mar 2026',
      takesCards: true,
      suspension: { since: 'Tue 15 Sep', reason: 'Badge number belongs to somebody else', byName: 'Sue Super' },
      members: [
        { userId: 'user-1', name: 'Asha Khan', contact: '07700 900123', role: 'owner', active: true, verification: 'approved' },
        { userId: 'user-2', name: 'No name given', contact: 'max@example.com', role: 'manager', active: false, verification: null },
      ],
      learners: 12,
      lessonsToCome: 3,
    });
    expect(rpc).toHaveBeenCalledWith('admin_business', { p_business_id: 'business-1' });
  });

  it('has no suspension for a Business in good standing, and nothing for one that does not exist', async () => {
    rpc.mockResolvedValueOnce({ data: { ...detail, status: 'active', suspended_at: null, suspension_reason: null, suspended_by_name: null }, error: null });
    expect((await adminBusiness('business-1'))?.suspension).toBeNull();

    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await adminBusiness('business-9')).toBeNull();
  });

  it('fails loudly when the database refuses, rather than showing nothing found', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(findBusinesses('asha')).rejects.toThrow('Could not search Businesses: NOT_ALLOWED');
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(adminBusiness('business-1')).rejects.toThrow('Could not read the Business: NOT_ALLOWED');
  });
});
