import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePortal = vi.fn<() => Promise<unknown>>();
const savePrices = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const savePackage = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/catalogue/save', () => ({
  savePrices: (...args: unknown[]) => savePrices(...args),
  savePackage: (...args: unknown[]) => savePackage(...args),
}));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: vi.fn(), expireInstructorProfile: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { saveBusinessPackage, saveBusinessPrices, saveFirstPrices, saveOwnPrices } = await import('./actions');

function teachingFor(businessType: 'independent' | 'school') {
  requirePortal.mockResolvedValue({
    access: { memberships: [{ businessId: 'biz-1', businessType, role: businessType === 'school' ? 'instructor' : 'owner', instructorProfileId: 'profile-1' }] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  savePrices.mockResolvedValue({ ok: true, data: null });
  savePackage.mockResolvedValue({ ok: true, data: { packageId: 'p-1' } });
  rpc.mockResolvedValue({ data: 'lesson-type-1', error: null });
});

describe('the first price, for somebody who skipped it in onboarding (R-05, M1-08, D-266)', () => {
  it('makes the standard lesson from an hour, and the block if they sell one, as onboarding does', async () => {
    teachingFor('independent');
    expect(await saveFirstPrices({ hourlyPrice: '42', packagePrice: '380' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_onboarding_prices', {
      p_business_id: 'biz-1',
      p_hourly_price_pence: 4200,
      p_package_price_pence: 38000,
    });
  });

  it('says what to fix, and is not for an instructor at a school, whose school sets the prices', async () => {
    teachingFor('independent');
    expect(await saveFirstPrices({ hourlyPrice: 'lots' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    teachingFor('school');
    expect(await saveFirstPrices({ hourlyPrice: '42', packagePrice: '' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
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
