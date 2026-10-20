import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const schoolProfile = vi.fn<(slug: string) => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/public/school-profile', () => ({ schoolProfile: (slug: string) => schoolProfile(slug) }));

const { askSchool } = await import('./actions');

const asked = { fullName: 'Pat Pupil', email: 'pat@example.com', phone: '', postcode: 'm1 1ae', transmission: 'automatic', note: 'Evenings', agreed: true };

beforeEach(() => {
  vi.clearAllMocks();
  schoolProfile.mockResolvedValue({ name: 'Quayside Driving School' });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('asking a school for lessons from its page (M9-15, D-288)', () => {
  it('sends what they gave, with the words they agreed to in the school\'s name', async () => {
    expect(await askSchool('quayside', asked)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('submit_school_enquiry', {
      p_slug: 'quayside',
      p_full_name: 'Pat Pupil',
      p_postcode: 'M1 1AE',
      p_consent:
        'I agree to Quayside Driving School keeping these details and passing them to one of its instructors, who will contact me about lessons.',
      p_email: 'pat@example.com',
      p_phone: undefined,
      p_transmission: 'automatic',
      p_note: 'Evenings',
    });
  });

  it('answers a script that filled in the hidden box as if it worked, and sends nothing', async () => {
    expect(await askSchool('quayside', { ...asked, company: 'Acme' })).toEqual({ ok: true, data: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('needs their agreement, and says when the school is not there or they have asked too often', async () => {
    expect(await askSchool('quayside', { ...asked, agreed: false })).toMatchObject({
      ok: false,
      fields: { agreed: 'Tick this so the school can pass your details to an instructor' },
    });
    schoolProfile.mockResolvedValueOnce(null);
    expect(await askSchool('gone', asked)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'RATE_LIMITED' } });
    expect(await askSchool('quayside', asked)).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});
