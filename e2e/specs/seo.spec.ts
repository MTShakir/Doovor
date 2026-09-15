import { writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { cachePostcode, makeInstructor, type MadeInstructor } from '../support/database';
import { addDays, freshPublicPages, robotsOf, snapPath } from '../support/helpers';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** The addresses a sitemap or sitemap index lists, as paths on whichever host is serving. */
async function listed(request: APIRequestContext, path: string): Promise<string[]> {
  const response = await request.get(path);
  expect(response.ok(), path).toBe(true);
  expect(response.headers()['content-type']).toContain('application/xml');
  return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const url = new URL((match[1] ?? '').replaceAll('&amp;', '&'));
    return `${url.pathname}${url.search}`;
  });
}

async function metaContent(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().getAttribute('content')) ?? '';
}

/** A PNG's size, from its header chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Fetches the image a page's preview shows, checks it is the size previews expect, and keeps a copy for the report. */
async function shareImage(page: Page, name: string, testInfo: TestInfo): Promise<string> {
  const url = new URL(await metaContent(page, 'meta[property="og:image"]'));
  const response = await page.request.get(`${url.pathname}${url.search}`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('image/png');
  const bytes = await response.body();
  expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
  writeFileSync(snapPath(testInfo, name), bytes);
  return `${url.pathname}${url.search}`;
}

/**
 * Sitemaps, canonical addresses and share images (PRD 14.6, M5-08). Other tests make and remove
 * instructors while these run, so the sitemaps are checked for what these tests put there and what
 * the seed keeps, never for everything they hold.
 */
test.describe('sitemaps, canonical addresses and share images (PRD 14.6, M5-08)', () => {
  test('the sitemap index lists every type, and each lists only pages search may show, at their canonical addresses', async ({ page, request }, testInfo) => {
    expect(await listed(request, '/sitemap.xml')).toEqual([
      '/sitemaps/pages.xml',
      '/sitemaps/instructors.xml',
      '/sitemaps/schools.xml',
      '/sitemaps/places.xml',
    ]);
    expect((await request.get('/sitemaps/learners.xml')).status()).toBe(404);

    // A London borough of each width's own, filled to three: Islington on a phone, Lambeth on a wide screen.
    const area =
      testInfo.project.name === 'mobile'
        ? { slug: 'islington', name: 'Islington', postcode: 'N7 6PA', latitude: 51.5553, longitude: -0.117 }
        : { slug: 'lambeth', name: 'Lambeth', postcode: 'SW9 8JX', latitude: 51.47, longitude: -0.1136 };
    await cachePostcode({ postcode: area.postcode, latitude: area.latitude, longitude: area.longitude, district: area.name });
    const made: MadeInstructor[] = [];
    try {
      for (const name of ['Ida', 'Ivo', 'Isla']) {
        made.push(await makeInstructor(`${name} ${area.name}`, addDays(today(), 365), { postcode: area.postcode }));
      }
      await freshPublicPages(page);

      expect(await listed(request, '/sitemaps/pages.xml')).toContain('/');
      const instructors = await listed(request, '/sitemaps/instructors.xml');
      expect(instructors).toEqual(expect.arrayContaining(['/instructors/leeds/sarah-khan', '/instructors/manchester/emma-clarke', ...made.map((one) => `/instructors/london/${one.slug}`)]));
      // Aisha Rahman is still waiting to be checked.
      expect(instructors.filter((path) => path.endsWith('/aisha-rahman'))).toEqual([]);
      expect(await listed(request, '/sitemaps/schools.xml')).toContain('/schools/manchester/quayside-driving-school');
      const places = await listed(request, '/sitemaps/places.xml');
      expect(places).toEqual(expect.arrayContaining(['/driving-lessons/london', `/driving-lessons/london/${area.slug}`]));
      // Manchester lists two: too thin to index.
      expect(places).not.toContain('/driving-lessons/manchester');

      // Every page these tests know about is there to be indexed, at the address the sitemap gives.
      for (const path of ['/instructors/leeds/sarah-khan', '/schools/manchester/quayside-driving-school', `/driving-lessons/london/${area.slug}`, `/instructors/london/${made[0]?.slug ?? ''}`]) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(200);
        expect(await robotsOf(page), path).toBeNull();
        expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '').pathname, path).toBe(path);
      }

      // With one of the three gone, the area is thin again and leaves the sitemap.
      await made.pop()?.remove();
      await freshPublicPages(page);
      expect(await listed(request, '/sitemaps/places.xml')).not.toContain(`/driving-lessons/london/${area.slug}`);
    } finally {
      for (const one of made) await one.remove();
      await freshPublicPages(page);
    }
  });

  test('a shared profile, school, place or booking link previews with the image drawn for it', async ({ page }, testInfo) => {
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    const canonical = (await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '';
    expect(new URL(canonical).pathname).toBe('/instructors/leeds/sarah-khan');
    expect(await metaContent(page, 'meta[property="og:url"]')).toBe(canonical);
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe('profile');
    expect(await metaContent(page, 'meta[property="og:title"]')).toBe('Sarah Khan, driving instructor in Leeds');
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    const profileImage = await shareImage(page, 'share-image-instructor', testInfo);
    expect(profileImage).toMatch(/^\/instructors\/leeds\/sarah-khan\/share\.png\?v=[0-9a-z]+$/);

    // The booking link, shared far more often than the profile, previews with the same picture.
    await page.goto('/book/sarah-khan');
    await expect(page.getByLabel('Which lesson?')).toBeVisible();
    const bookingImage = new URL(await metaContent(page, 'meta[property="og:image"]'));
    expect(`${bookingImage.pathname}${bookingImage.search}`).toBe(profileImage);
    expect(new URL(await metaContent(page, 'meta[property="og:url"]')).pathname).toBe('/book/sarah-khan');

    await page.goto('/schools/manchester/quayside-driving-school');
    await expect(page.getByRole('heading', { level: 1, name: 'Quayside Driving School' })).toBeVisible();
    await shareImage(page, 'share-image-school', testInfo);

    await page.goto('/driving-lessons/manchester/automatic');
    await expect(page.getByRole('heading', { level: 1, name: 'Automatic driving lessons in Manchester' })).toBeVisible();
    await shareImage(page, 'share-image-place', testInfo);

    // Nothing is drawn for a profile or a place that is not there.
    expect((await page.request.get('/instructors/leeds/nobody-teaches-here/share.png')).status()).toBe(404);
    expect((await page.request.get('/driving-lessons/atlantis/share.png')).status()).toBe(404);
  });
});
