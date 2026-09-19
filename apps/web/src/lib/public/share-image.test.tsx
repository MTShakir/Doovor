import { instructorShareCard, placeShareCard } from '@repo/core/share-card';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageUrl = 'https://storage.example.com';
vi.mock('@/env/client', () => ({ clientEnv: { NEXT_PUBLIC_SUPABASE_URL: storageUrl } }));

const { drawablePhoto, shareImageResponse } = await import('./share-image');

/** A PNG's size, from its header chunk, which follows the eight-byte signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function drawn(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

const photoUrl = `${storageUrl}/storage/v1/object/public/avatars/sarah.webp`;
const card = instructorShareCard({
  name: 'Sarah Khan',
  qualification: 'adi',
  transmission: 'manual',
  cityName: 'Leeds',
  hourlyFromPence: 4200,
  takingBookings: true,
  photoUrl,
});

/**
 * Answers requests for the photo alone. The renderer fetches its own parts as it starts, so
 * everything else goes to the real fetch.
 */
function requested(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input instanceof URL ? input.href : input;
}

function photoAnswers(answer: () => Promise<Response>) {
  const realFetch = globalThis.fetch;
  const fetchPhoto = vi.fn((input: RequestInfo | URL, init?: RequestInit) => (requested(input) === photoUrl ? answer() : realFetch(input, init)));
  vi.stubGlobal('fetch', fetchPhoto);
  return fetchPhoto;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawing the image a shared page shows (PRD 14.6, M5-08)', () => {
  it('draws a PNG the size link previews expect, kept for a day', async () => {
    photoAnswers(() => Promise.reject(new Error('No connection')));
    const response = await shareImageResponse(card);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, stale-while-revalidate=604800');
    const bytes = await drawn(response);
    expect(String.fromCharCode(...bytes.slice(1, 4))).toBe('PNG');
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it('turns a WebP photo into one the renderer can draw, and draws initials when the photo cannot be had', async () => {
    const webp = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 39, g: 110, b: 241 } } })
      .webp()
      .toBuffer();
    const fetchPhoto = photoAnswers(() => Promise.resolve(new Response(new Uint8Array(webp), { headers: { 'content-type': 'image/webp' } })));
    expect(await drawablePhoto(photoUrl)).toMatch(/^data:image\/png;base64,/);
    // Fetched with a time limit, so a slow photo never holds the image up for long.
    const photoCall = fetchPhoto.mock.calls.find(([input]) => requested(input) === photoUrl);
    expect(photoCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    const withPhoto = await drawn(await shareImageResponse(card));

    photoAnswers(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await drawablePhoto(photoUrl)).toBeNull();
    const withInitials = await drawn(await shareImageResponse(card));

    expect(pngSize(withInitials)).toEqual({ width: 1200, height: 630 });
    expect(Buffer.from(withPhoto).equals(Buffer.from(withInitials))).toBe(false);
    expect(await drawablePhoto(null)).toBeNull();
  });

  it('draws a place page, which has no picture', async () => {
    const place = placeShareCard({ citySlug: 'london', cityName: 'London', area: { slug: 'camden', name: 'Camden' }, instructorCount: 3 });
    expect(pngSize(await drawn(await shareImageResponse(place)))).toEqual({ width: 1200, height: 630 });
  });
});

describe('which photos the drawer will fetch (NFR-SEC-03, M6-01, D-135)', () => {
  it('fetches a stored picture of ours, and a picture carried in the address itself', async () => {
    const fetchPhoto = photoAnswers(async () => new Response(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).webp().toBuffer()));
    expect(await drawablePhoto(photoUrl)).toContain('data:image/png;base64,');
    expect(fetchPhoto).toHaveBeenCalledTimes(1);
  });

  it('draws initials for a photo anywhere else, without asking for it', async () => {
    const fetchPhoto = photoAnswers(() => Promise.resolve(new Response('never', { status: 200 })));
    for (const elsewhere of ['http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/avatar.webp', `${storageUrl}/storage/v1/object/public/badges/secret.webp`]) {
      expect(await drawablePhoto(elsewhere)).toBeNull();
    }
    expect(fetchPhoto).not.toHaveBeenCalled();
  });
});
