import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
const requireOnboarding = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/onboarding/session', () => ({ requireOnboarding: () => requireOnboarding() }));
vi.mock('@/lib/geo/provider', () => ({ getGeoProvider: vi.fn() }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: vi.fn() }));
vi.mock('@/lib/storage/images', () => ({ avatarsBucket: 'avatars', removeProfileImage: vi.fn() }));
vi.mock('@/lib/verification/submit-badge', () => ({ submitBadge: vi.fn() }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw new Error(`redirected to ${path}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { savePrices } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  requireOnboarding.mockResolvedValue({ businessId: 'biz-1', profileId: 'profile-1', step: 4, businessType: 'independent' });
});

describe('the prices step (AUTH-04 step 4, R-05)', () => {
  it('says the most a linked school allows, rather than asking to check the fields (D-286)', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'VALIDATION_FAILED',
        details: '{"field": "price", "reason": "above_school_cap", "maxHourlyPence": 4500, "school": "Quayside Driving School"}',
      },
    });
    expect(await savePrices({ hourlyPrice: '50', packagePrice: '' })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Quayside Driving School lets you charge at most £45 an hour. Lower the prices above it.',
    });
    expect(rpc).toHaveBeenCalledWith('set_onboarding_prices', expect.objectContaining({ p_business_id: 'biz-1', p_hourly_price_pence: 5000 }));
  });

  it('passes any other refusal on by its code', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await savePrices({ hourlyPrice: '42', packagePrice: '' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});
