import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const adminBusiness = vi.fn<(id: string) => Promise<unknown>>();
const expireAllInstructorProfiles = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/admin/businesses', () => ({ adminBusiness: (id: string) => adminBusiness(id) }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAllInstructorProfiles(); } }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { openBusiness, reactivateBusiness, suspendBusiness } = await import('./actions');

const businessId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'super_admin' } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('opening a Business (ADM-02, M5-18)', () => {
  it('reads it for staff, and says when there is nothing there', async () => {
    adminBusiness.mockResolvedValueOnce({ businessId, name: 'Asha Driving' });
    expect(await openBusiness({ businessId })).toEqual({ ok: true, data: { businessId, name: 'Asha Driving' } });
    expect(requirePortal).toHaveBeenCalled();

    adminBusiness.mockResolvedValueOnce(null);
    expect(await openBusiness({ businessId })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await openBusiness({ businessId: 'asha-driving' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('suspending and reactivating a Business (ADM-02, M5-18)', () => {
  it('suspends it with the reason given, then has every public page read fresh', async () => {
    expect(await suspendBusiness({ businessId, reason: ' Badge belongs to somebody else ' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_business_suspended', {
      p_business_id: businessId,
      p_suspended: true,
      p_reason: 'Badge belongs to somebody else',
    });
    expect(expireAllInstructorProfiles).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/admin/businesses');
  });

  it('will not suspend without a reason, and asks nothing of the database', async () => {
    expect(await suspendBusiness({ businessId, reason: '  ' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { reason: 'Say why, so whoever looks at it next knows' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reactivates it', async () => {
    expect(await reactivateBusiness({ businessId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_business_suspended', { p_business_id: businessId, p_suspended: false });
    expect(expireAllInstructorProfiles).toHaveBeenCalledOnce();
  });

  it('says what the database refused, and changes no public page', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await suspendBusiness({ businessId, reason: 'Fake badge' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "already_suspended"}' } });
    expect(await suspendBusiness({ businessId, reason: 'Fake badge' })).toMatchObject({ ok: false, message: 'It is already suspended.' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "not_suspended"}' } });
    expect(await reactivateBusiness({ businessId })).toMatchObject({ ok: false, message: 'It is not suspended.' });

    expect(expireAllInstructorProfiles).not.toHaveBeenCalled();
  });
});
