import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolSetupSession } from '@/lib/onboarding/school-session';

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirected to ${path}`);
  }
}

const rpc = vi.fn();
const single = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const lookup = vi.fn();
const remove = vi.fn<(...args: unknown[]) => Promise<void>>();
const expireSchoolProfile = vi.fn<(slug: string) => void>();
const requireSchoolSetup = vi.fn<(path: string) => Promise<SchoolSetupSession>>();

const from = vi.fn(() => ({ update }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from }) }));
vi.mock('@/lib/geo/provider', () => ({ getGeoProvider: () => Promise.resolve({ lookup }) }));
vi.mock('@/lib/onboarding/school-session', () => ({ requireSchoolSetup: (path: string) => requireSchoolSetup(path) }));
vi.mock('@/lib/public/school-profile', () => ({ expireSchoolProfile: (slug: string) => { expireSchoolProfile(slug); } }));
vi.mock('@/lib/storage/images', () => ({ avatarsBucket: 'avatars', removeProfileImage: (...args: unknown[]) => remove(...args) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));
vi.mock('@/lib/redirect-to', () => ({
  redirectTo: (path: string) => {
    throw new Redirected(path);
  },
}));

const { finishSchoolSetup, inviteInstructor, saveSchoolDetails } = await import('./actions');

const businessId = '11111111-2222-4333-8444-555555555555';
const session: SchoolSetupSession = {
  businessId,
  slug: 'northern-lights-driving',
  name: 'Northern Lights Driving',
  logoPath: null,
  basePostcode: null,
  expectedInstructors: null,
};
const manchester = { postcode: 'M1 1AE', outcode: 'M1', latitude: 53.4794, longitude: -2.2453, district: 'Manchester', country: 'England' };
const details = { name: 'Northern Lights Driving', postcode: 'm1 1ae', expectedInstructors: '6' };
const logo = `businesses/${businessId}/9a8b7c6d-5e4f-4031-8213-b4c5d6e7f8a9.webp`;

beforeEach(() => {
  vi.clearAllMocks();
  requireSchoolSetup.mockResolvedValue(session);
  update.mockReturnValue({ eq });
  eq.mockResolvedValue({ error: null });
  lookup.mockResolvedValue({ ok: true, place: manchester });
  remove.mockResolvedValue(undefined);
  rpc.mockReturnValue({ single });
});

describe('saving what the school is (AUTH-05, M5-11)', () => {
  it('saves the name, the place the postcode is and the size, then moves on to inviting', async () => {
    await expect(saveSchoolDetails({ ...details, logoPath: logo })).rejects.toMatchObject({ path: '/onboarding/school/invite' });
    expect(from).toHaveBeenCalledWith('businesses');
    expect(update).toHaveBeenCalledWith({
      name: 'Northern Lights Driving',
      base_postcode: 'M1 1AE',
      base_location: 'SRID=4326;POINT(-2.2453 53.4794)',
      expected_instructors: 6,
      logo_url: logo,
    });
    expect(eq).toHaveBeenCalledWith('id', businessId);
    expect(expireSchoolProfile).toHaveBeenCalledWith('northern-lights-driving');
  });

  it('leaves the logo alone when none was chosen, and removes one that was replaced', async () => {
    await expect(saveSchoolDetails(details)).rejects.toBeInstanceOf(Redirected);
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('logo_url');
    expect(remove).not.toHaveBeenCalled();

    const before = `businesses/${businessId}/11111111-aaaa-4bbb-8ccc-dddddddddddd.webp`;
    requireSchoolSetup.mockResolvedValueOnce({ ...session, logoPath: before });
    await expect(saveSchoolDetails({ ...details, logoPath: null })).rejects.toBeInstanceOf(Redirected);
    expect(update.mock.calls[1]?.[0]).toMatchObject({ logo_url: null });
    expect(remove).toHaveBeenCalledWith(expect.anything(), 'avatars', before);
  });

  it('refuses a logo from anywhere but the school folder, whatever the browser sends', async () => {
    const elsewhere = 'businesses/99999999-2222-4333-8444-555555555555/9a8b7c6d-5e4f-4031-8213-b4c5d6e7f8a9.webp';
    expect(await saveSchoolDetails({ ...details, logoPath: elsewhere })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('says what to fix, including a postcode that does not exist or cannot be checked', async () => {
    expect(await saveSchoolDetails({ ...details, expectedInstructors: '' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { expectedInstructors: 'Enter how many instructors teach for you, like 6' },
    });
    expect(requireSchoolSetup).not.toHaveBeenCalled();

    lookup.mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' });
    expect(await saveSchoolDetails(details)).toMatchObject({ fields: { postcode: 'We could not find that postcode. Check it and try again' } });
    lookup.mockResolvedValueOnce({ ok: false, reason: 'UNAVAILABLE' });
    expect(await saveSchoolDetails(details)).toMatchObject({ code: 'UNKNOWN', message: 'We could not check that postcode just now. Try again in a moment.' });
    expect(update).not.toHaveBeenCalled();

    eq.mockResolvedValueOnce({ error: { message: 'denied' } });
    expect(await saveSchoolDetails(details)).toMatchObject({ code: 'UNKNOWN', message: 'We could not save your school. Try again.' });
    expect(expireSchoolProfile).not.toHaveBeenCalled();
  });
});

describe('inviting an instructor to the school (AUTH-05, M5-11)', () => {
  it('makes a link to the invitation for the number it is sent to', async () => {
    single.mockResolvedValueOnce({ data: { invitation_id: 'inv-1', token: 'tok_abc-123', expires_at: '2026-09-30T10:00:00Z' }, error: null });
    expect(await inviteInstructor({ channel: 'sms', fullName: 'Nia Newcomer', email: '', phone: '07700 900555' })).toEqual({
      ok: true,
      data: {
        link: 'https://app.example.test/invite/tok_abc-123',
        schoolName: 'Northern Lights Driving',
        fullName: 'Nia Newcomer',
        email: null,
        phone: '+447700900555',
      },
    });
    expect(rpc).toHaveBeenCalledWith('invite_member', {
      p_business_id: businessId,
      p_role: 'instructor',
      p_channel: 'sms',
      p_full_name: 'Nia Newcomer',
      p_email: undefined,
      p_phone: '+447700900555',
    });
  });

  it('needs somewhere to send it, and passes on being told to slow down', async () => {
    expect(await inviteInstructor({ channel: 'whatsapp', fullName: '', email: '', phone: '' })).toMatchObject({
      ok: false,
      fields: { phone: 'Enter a mobile number to send it to' },
    });
    expect(rpc).not.toHaveBeenCalled();

    single.mockResolvedValueOnce({ data: null, error: { code: '53400', message: 'RATE_LIMITED' } });
    expect(await inviteInstructor({ channel: 'link', fullName: '', email: '', phone: '' })).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});

describe('finishing setting up the school (AUTH-05, M5-11)', () => {
  it('marks the school set up and opens its portal', async () => {
    await expect(finishSchoolSetup()).rejects.toMatchObject({ path: '/app/school' });
    expect(update).toHaveBeenCalledWith({ onboarding_completed_at: expect.any(String) as string });
    expect(eq).toHaveBeenCalledWith('id', businessId);
  });

  it('stays put when the school could not be saved', async () => {
    eq.mockResolvedValueOnce({ error: { message: 'denied' } });
    expect(await finishSchoolSetup()).toMatchObject({ ok: false, message: 'We could not finish setting up your school. Try again.' });
  });
});
