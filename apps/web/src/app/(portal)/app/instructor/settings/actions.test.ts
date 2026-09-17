import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePortal = vi.fn<() => Promise<unknown>>();
const savePrices = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const savePackage = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({}) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/catalogue/save', () => ({
  savePrices: (...args: unknown[]) => savePrices(...args),
  savePackage: (...args: unknown[]) => savePackage(...args),
}));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: vi.fn(), expireInstructorProfile: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { saveBusinessPackage, saveBusinessPrices, saveOwnPrices } = await import('./actions');

function teachingFor(businessType: 'independent' | 'school') {
  requirePortal.mockResolvedValue({
    access: { memberships: [{ businessId: 'biz-1', businessType, role: businessType === 'school' ? 'instructor' : 'owner', instructorProfileId: 'profile-1' }] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  savePrices.mockResolvedValue({ ok: true, data: null });
  savePackage.mockResolvedValue({ ok: true, data: { packageId: 'p-1' } });
});

describe('prices from the instructor settings (R-05, SCH-04, M5-15)', () => {
  it('lets an instructor on their own set the prices and packages of their Business', async () => {
    teachingFor('independent');
    await saveBusinessPrices({ prices: [] });
    expect(savePrices).toHaveBeenCalledWith('biz-1', null, { prices: [] });
    await saveBusinessPackage({ packageId: null });
    expect(savePackage).toHaveBeenCalledWith('biz-1', { packageId: null });
    expect(await saveOwnPrices({ prices: [] })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('lets an instructor at a school set only their own prices, which the database checks the school allows', async () => {
    teachingFor('school');
    await saveOwnPrices({ prices: [] });
    expect(savePrices).toHaveBeenCalledWith('biz-1', 'profile-1', { prices: [] });
    expect(await saveBusinessPrices({ prices: [] })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveBusinessPackage({})).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(savePackage).not.toHaveBeenCalled();
  });
});
