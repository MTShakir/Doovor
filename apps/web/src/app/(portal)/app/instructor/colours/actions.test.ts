import { brand } from '@repo/config/brand';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const expireAllInstructorProfiles = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
// Refusing to write anything while staff are looking through somebody's eyes (ADM-06) reads the
// session itself, which no unit test has.
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => Promise.resolve(null) }));
vi.mock('@/lib/public/instructor-profile', () => ({
  expireAllInstructorProfiles: () => {
    expireAllInstructorProfiles();
  },
}));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidatePath(path);
  },
}));

const { setBookingColour } = await import('./actions');

const businessId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({});
  rpc.mockResolvedValue({ data: '#0F6E4C', error: null });
});

describe('a Business choosing its own colour (D-210, D-229)', () => {
  it('saves it and reads every profile of that Business fresh', async () => {
    // The colour draws the public profile now, and a profile is kept for hours: without this an
    // instructor would change their colour and not see it on their own page until it expired.
    expect(await setBookingColour({ businessId, colour: '#0F6E4C' })).toEqual({ ok: true, data: { colour: '#0F6E4C' } });
    expect(rpc).toHaveBeenCalledWith('set_brand_colour', { p_business_id: businessId, p_colour: '#0F6E4C' });
    expect(expireAllInstructorProfiles).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor/colours');
  });

  it('refuses a colour nothing can be read on, and changes nothing', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'VALIDATION_FAILED', details: '{"reason": "contrast"}' } });
    const result = await setBookingColour({ businessId, colour: brand.colours.yellow });

    expect(result.ok).toBe(false);
    expect(expireAllInstructorProfiles).not.toHaveBeenCalled();
  });

  it('says nothing was saved when the input is not a colour at all', async () => {
    const result = await setBookingColour({ businessId, colour: 'green please' });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(expireAllInstructorProfiles).not.toHaveBeenCalled();
  });
});
