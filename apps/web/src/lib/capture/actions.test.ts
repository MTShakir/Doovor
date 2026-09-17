import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const lookup = vi.fn();
const cityPage = vi.fn<(...args: unknown[]) => Promise<unknown>>();

const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from }) }));
vi.mock('@/lib/geo/provider', () => ({ getGeoProvider: () => Promise.resolve({ lookup }) }));
vi.mock('@/lib/public/city-page', () => ({ cityPage: (...args: unknown[]) => cityPage(...args) }));

const { checkArea, joinWaitingList, postLessonRequest, removeMyDetails } = await import('./actions');

const leeds = { postcode: 'LS6 3QS', outcode: 'LS6', latitude: 53.8196, longitude: -1.5719, district: 'Leeds', country: 'England' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checking an area (MKT-10, M5-10)', () => {
  it('counts the look first, then finds the postcode and the city page near it', async () => {
    rpc.mockResolvedValueOnce({ data: { postcode: 'LS6 3QS', postcodeArea: 'LS', open: false }, error: null });
    lookup.mockResolvedValueOnce({ ok: true, place: leeds });
    maybeSingle.mockResolvedValueOnce({ data: { city_slug: 'leeds' } });
    cityPage.mockResolvedValueOnce({ city: { slug: 'leeds', name: 'Leeds' }, instructors: [{}, {}] });

    expect(await checkArea({ postcode: 'ls6 3qs' })).toEqual({
      ok: true,
      data: { postcode: 'LS6 3QS', postcodeArea: 'LS', open: false, city: { slug: 'leeds', name: 'Leeds', instructorCount: 2 } },
    });
    expect(rpc).toHaveBeenCalledWith('coming_soon_area', { p_postcode: 'LS6 3QS' });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(lookup.mock.invocationCallOrder[0] ?? 0);
    expect(cityPage).toHaveBeenCalledWith('leeds', null, false);
  });

  it('has no city for a district outside the launch cities', async () => {
    rpc.mockResolvedValueOnce({ data: { postcode: 'BS1 4DJ', postcodeArea: 'BS', open: false }, error: null });
    lookup.mockResolvedValueOnce({ ok: true, place: { ...leeds, postcode: 'BS1 4DJ', district: 'Bristol, City of' } });
    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await checkArea({ postcode: 'BS1 4DJ' })).toMatchObject({ ok: true, data: { city: null } });
  });

  it('says what went wrong: not a postcode, one that does not exist, too many tries, or the lookup being down', async () => {
    expect(await checkArea({ postcode: 'nope' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED', fields: { postcode: 'Enter a UK postcode like LS1 4DY' } });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'RATE_LIMITED' } });
    expect(await checkArea({ postcode: 'LS6 3QS' })).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(lookup).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: { postcode: 'LS99 9ZZ', postcodeArea: 'LS', open: false }, error: null });
    lookup.mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' });
    expect(await checkArea({ postcode: 'LS99 9ZZ' })).toMatchObject({ fields: { postcode: 'We could not find that postcode. Check it and try again' } });
    lookup.mockResolvedValueOnce({ ok: false, reason: 'UNAVAILABLE' });
    expect(await checkArea({ postcode: 'LS99 9ZZ' })).toMatchObject({ code: 'UNKNOWN', message: 'We could not check that postcode just now. Try again in a moment.' });
  });
});

describe('keeping a waiting list place or a lesson request (MKT-10, M5-10)', () => {
  it('joins the waiting list with the consent words shown, and nothing for a gearbox not chosen', async () => {
    rpc.mockResolvedValueOnce({ data: { postcodeArea: 'LS' }, error: null });
    expect(await joinWaitingList({ postcode: 'LS6 3QS', fullName: 'Lily Learner', email: 'Lily@Example.com', consent: true })).toEqual({
      ok: true,
      data: { postcodeArea: 'LS' },
    });
    expect(rpc).toHaveBeenCalledWith('join_area_waiting_list', {
      p_postcode: 'LS6 3QS',
      p_full_name: 'Lily Learner',
      p_email: 'lily@example.com',
      p_consent: 'Keep my details and email me when I can find and book driving instructors near LS. I can leave the list at any time.',
    });
  });

  it('keeps nothing without the box ticked, and puts a refusal beside its field', async () => {
    expect(await joinWaitingList({ postcode: 'LS6 3QS', fullName: 'Lily', email: 'lily@example.com', consent: false })).toMatchObject({
      ok: false,
      fields: { consent: 'Tick the box so we may keep this and email you about it' },
    });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "email"}' } });
    expect(await joinWaitingList({ postcode: 'LS6 3QS', fullName: 'Lily', email: 'lily@example.com', consent: true })).toMatchObject({
      fields: { email: 'Check this and try again' },
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'MARKETPLACE_OPEN' } });
    expect(await joinWaitingList({ postcode: 'LS6 3QS', fullName: 'Lily', email: 'lily@example.com', consent: true })).toMatchObject({
      code: 'MARKETPLACE_OPEN',
      message: 'You can already find and book instructors near you.',
    });
  });

  it('posts a lesson request as the database keeps it, leaving out what was not given', async () => {
    rpc.mockResolvedValueOnce({ data: { postcodeArea: 'LS' }, error: null });
    await postLessonRequest({
      postcode: 'LS6 3QS',
      fullName: 'Rob Request',
      email: 'rob@example.com',
      phone: '',
      transmission: 'manual',
      experience: 'some',
      days: [6, 1],
      times: ['evening'],
      startWhen: 'now',
      budget: '',
      consent: true,
    });
    expect(rpc).toHaveBeenCalledWith('post_lesson_request', {
      p_postcode: 'LS6 3QS',
      p_full_name: 'Rob Request',
      p_email: 'rob@example.com',
      p_transmission: 'manual',
      p_experience: 'some',
      p_days: [6, 1],
      p_times: ['evening'],
      p_start_when: 'now',
      p_consent:
        'Keep my lesson request and email me about it when instructors near LS can take bookings through the app. I can withdraw it at any time.',
    });
  });

  it('removes everything kept for a token, and turns away a link that is not one', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    expect(await removeMyDetails({ token: '5b0f2c4e-3a51-4c0a-9d7e-1f2a3b4c5d6e' })).toEqual({ ok: true, data: { removed: 2 } });
    expect(rpc).toHaveBeenCalledWith('leave_learner_capture', { p_token: '5b0f2c4e-3a51-4c0a-9d7e-1f2a3b4c5d6e' });
    expect(await removeMyDetails({ token: 'not-a-token' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
