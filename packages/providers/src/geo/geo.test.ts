import { describe, expect, it, vi } from 'vitest';
import { cachedGeoProvider } from './cached.ts';
import { postcodesIoProvider } from './postcodes-io.ts';
import type { GeoPlace, GeoProvider, PostcodeStore } from './types.ts';

const leeds = {
  postcode: 'LS6 3HN',
  outcode: 'LS6',
  latitude: 53.815,
  longitude: -1.566,
  admin_district: 'Leeds',
  country: 'England',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

type FetchLike = () => Promise<Response>;

function providerWith(fetchImpl: FetchLike): GeoProvider {
  return postcodesIoProvider({ fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: 'https://geo.test' });
}

describe('postcodes.io (COV-03, M1-05)', () => {
  it('turns a postcode into a place', async () => {
    const call = vi.fn(() => Promise.resolve(jsonResponse({ status: 200, result: leeds })));
    const result = await providerWith(call).lookup('ls6 3hn');

    expect(call).toHaveBeenCalledWith('https://geo.test/postcodes/LS6%203HN', expect.anything());
    expect(result).toEqual({
      ok: true,
      place: { postcode: 'LS6 3HN', outcode: 'LS6', latitude: 53.815, longitude: -1.566, district: 'Leeds', country: 'England' },
    });
  });

  it('does not ask about something that is not a postcode', async () => {
    const call = vi.fn(() => Promise.resolve(jsonResponse({})));
    expect(await providerWith(call).lookup('not a postcode')).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('reports a postcode that does not exist separately from one that is malformed', async () => {
    const call = vi.fn(() => Promise.resolve(jsonResponse({ status: 404 }, 404)));
    expect(await providerWith(call).lookup('LS6 3HX')).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('says the service is unavailable rather than guessing', async () => {
    const failures: FetchLike[] = [
      () => Promise.reject(new Error('network')),
      () => Promise.resolve(jsonResponse({}, 500)),
      () => Promise.resolve(new Response('not json', { status: 200 })),
      () => Promise.resolve(jsonResponse({ result: { ...leeds, latitude: null } })),
      // A result outside the United Kingdom is not one of ours.
      () => Promise.resolve(jsonResponse({ result: { ...leeds, latitude: 48.85, longitude: 2.35 } })),
    ];
    for (const failure of failures) {
      expect(await providerWith(failure).lookup('LS6 3HN')).toEqual({
        ok: false,
        reason: 'UNAVAILABLE',
      });
    }
  });

  it('falls back to working the district out itself', async () => {
    const call = vi.fn(() => Promise.resolve(jsonResponse({ result: { ...leeds, outcode: null, admin_district: '' } })));
    const result = await providerWith(call).lookup('LS6 3HN');

    expect(result.ok && result.place.outcode).toBe('LS6');
    expect(result.ok && result.place.district).toBeNull();
  });
});

function fakeStore(seed: GeoPlace[] = []) {
  const rows = new Map(seed.map((place) => [place.postcode, place]));
  const store: PostcodeStore = {
    get: (postcode) => Promise.resolve(rows.get(postcode) ?? null),
    put: (place) => {
      rows.set(place.postcode, place);
      return Promise.resolve();
    },
  };
  return { store, rows };
}

const place: GeoPlace = {
  postcode: 'LS6 3HN',
  outcode: 'LS6',
  latitude: 53.815,
  longitude: -1.566,
  district: 'Leeds',
  country: 'England',
};

describe('postcode cache (COV-03, M1-05)', () => {
  it('answers from the store without asking the service', async () => {
    const { store } = fakeStore([place]);
    const inner = { lookup: vi.fn(() => Promise.resolve({ ok: false as const, reason: 'UNAVAILABLE' as const })) };

    expect(await cachedGeoProvider(inner, store).lookup('ls63hn')).toEqual({ ok: true, place });
    expect(inner.lookup).not.toHaveBeenCalled();
  });

  it('keeps what it looked up, so the next person costs nothing', async () => {
    const { store, rows } = fakeStore();
    const inner = { lookup: vi.fn(() => Promise.resolve({ ok: true as const, place })) };

    await cachedGeoProvider(inner, store).lookup('LS6 3HN');

    expect(rows.get('LS6 3HN')).toEqual(place);
  });

  it('keeps nothing when the lookup failed', async () => {
    const { store, rows } = fakeStore();
    const inner = { lookup: vi.fn(() => Promise.resolve({ ok: false as const, reason: 'NOT_FOUND' as const })) };

    expect(await cachedGeoProvider(inner, store).lookup('LS6 3HX')).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(rows.size).toBe(0);
  });

  it('still answers when the store is broken', async () => {
    const store: PostcodeStore = {
      get: () => Promise.reject(new Error('database is down')),
      put: () => Promise.reject(new Error('database is down')),
    };
    const inner = { lookup: vi.fn(() => Promise.resolve({ ok: true as const, place })) };

    expect(await cachedGeoProvider(inner, store).lookup('LS6 3HN')).toEqual({ ok: true, place });
  });

  it('does not go near the store for something that is not a postcode', async () => {
    const { store } = fakeStore();
    const get = vi.spyOn(store, 'get');
    const inner = { lookup: vi.fn(() => Promise.resolve({ ok: true as const, place })) };

    expect(await cachedGeoProvider(inner, store).lookup('LS6')).toEqual({ ok: false, reason: 'INVALID' });
    expect(get).not.toHaveBeenCalled();
    expect(inner.lookup).not.toHaveBeenCalled();
  });
});
