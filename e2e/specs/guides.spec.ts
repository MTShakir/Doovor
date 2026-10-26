import { brand } from '@repo/config/brand';
import { audienceLabels, guideAuthor, guideBlocks, guideBySlug, guidePath, guidePictures, guides } from '@repo/core/guides';
import { expect, test } from '@playwright/test';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * The guides (PRD 8.3, 14.6, D-255): listed by who they are for, each a page search can read as
 * an article, with its questions, where its facts come from, and a way into the product.
 */
test.describe('guides (PRD 14.6, D-255)', () => {
  test('the guides page lists every guide under who it is for, and the site links to it', async ({ page }, testInfo) => {
    await page.goto('/guides');
    await expect(page.getByRole('heading', { level: 1, name: 'Guides' })).toBeVisible();
    for (const guide of guides) {
      const group = page.getByRole('region', { name: audienceLabels[guide.audience] });
      await expect(group.getByRole('link', { name: guide.title })).toHaveAttribute('href', guidePath(guide.slug));
    }
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/guides');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'guides');
  });

  test('a guide reads as an article, answers its questions, says where its facts come from, and leads somewhere', async ({ page, request }, testInfo) => {
    const guide = guides.find((one) => one.audience === 'instructors') ?? guides[0];
    if (guide === undefined) throw new Error('There is no guide');
    await page.goto(guidePath(guide.slug));

    await expect(page.getByRole('heading', { level: 1, name: guide.title })).toBeVisible();
    await expect(page.getByText(`By ${guideAuthor}`)).toBeVisible();

    // The short answers first, and where it applies, under the title (D-387).
    const short = page.getByRole('region', { name: 'In short' });
    for (const takeaway of guide.takeaways) await expect(short.getByText(takeaway)).toBeVisible();
    const places = page.getByRole('list', { name: 'Where this applies' });
    for (const place of guide.places) await expect(places.getByText(place.name, { exact: true })).toBeVisible();

    // Every picture of the app is there, described, captioned, and loads as the reader reaches it.
    for (const picture of guidePictures(guideBlocks(guide))) {
      const image = page.getByRole('img', { name: picture.alt });
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      await expect(page.locator('figcaption', { hasText: picture.caption })).toBeVisible();
    }
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: brand.name })).toHaveAttribute('href', '/');
    await expect(crumbs.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/guides');

    // The contents go to the headings they name.
    const contents = page.getByRole('navigation', { name: 'On this page' });
    const first = contents.getByRole('link').first();
    const target = (await first.getAttribute('href')) ?? '';
    await expect(page.locator(target)).toHaveRole('heading');

    // Every question, and every source, which opens beside the page.
    const questions = page.getByRole('region', { name: 'Questions' });
    for (const one of guide.questions) await expect(questions.getByText(one.question)).toBeVisible();
    const sources = page.getByRole('region', { name: 'Where this comes from' });
    for (const source of guide.sources) {
      const link = sources.getByRole('link', { name: source.label });
      await expect(link).toHaveAttribute('href', source.url);
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }

    // Search is told what it is, the address is its one address, and a shared link draws its card.
    const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}') as {
      '@graph': { '@type': string; keywords?: string; image?: string[] }[];
    };
    expect(structured['@graph'].map((node) => node['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
    expect(structured['@graph'][0]?.keywords).toBe(guide.keywords.join(', '));
    expect(structured['@graph'][0]?.image).toHaveLength(guidePictures(guideBlocks(guide)).length + 1);
    await expect(page.locator('meta[name="keywords"]')).toHaveAttribute('content', guide.keywords.join(','));
    await expect(page.locator('meta[name="geo.region"]')).toHaveAttribute('content', 'GB');
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '').pathname).toBe(guidePath(guide.slug));
    const image = new URL((await page.locator('meta[property="og:image"]').first().getAttribute('content')) ?? '');
    expect(image.pathname).toBe(`${guidePath(guide.slug)}/share.png`);
    expect((await request.get(`${image.pathname}${image.search}`)).headers()['content-type']).toBe('image/png');

    await expect(page.getByRole('link', { name: 'Create your free account' }).last()).toHaveAttribute('href', /\/sign-up\?role=instructor$/);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'guide', { fullPage: true });
  });

  test('a guide about a few towns carries their tags and where they are, for search and for readers (D-387)', async ({ page }) => {
    const local = guideBySlug('sidcup-belvedere-erith-driving-test-centres');
    if (local === undefined) throw new Error('There is no local guide');
    await page.goto(guidePath(local.slug));
    await expect(page.getByRole('heading', { level: 1, name: local.title })).toBeVisible();
    await expect(page.locator('meta[name="geo.region"]')).toHaveAttribute('content', 'GB-BEX');
    await expect(page.locator('meta[name="geo.placename"]')).toHaveAttribute('content', 'London Borough of Bexley');
    await expect(page.locator('meta[name="geo.position"]')).toHaveAttribute('content', '51.45;0.15');
    await expect(page.locator('meta[name="ICBM"]')).toHaveAttribute('content', '51.45, 0.15');
    await expect(page.getByRole('list', { name: 'Where this applies' }).getByRole('listitem')).toHaveCount(local.places.length);
    // The three test centres, in a table a reader and an assistant can both read.
    const centres = page.getByRole('table').first();
    for (const centre of ['Sidcup (London)', 'Erith (London)', 'Belvedere (London)']) await expect(centres.getByText(centre)).toBeVisible();
    await expectAccessible(page);
  });

  test('the comparison says who wrote it, and the instructors page leads to the newest guides (D-387)', async ({ page }) => {
    const comparison = guides.find((guide) => guide.slug.startsWith('total-drive-vs-mydrivetime-vs-'));
    if (comparison === undefined) throw new Error('There is no comparison');
    await page.goto(guidePath(comparison.slug));
    await expect(page.getByText(`We make ${brand.name}, so read this knowing that.`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: `What ${brand.name} does not do yet` })).toBeVisible();

    await page.goto('/instructors-software');
    const read = page.getByRole('region', { name: 'Read before you choose' });
    const newest = guides.filter((guide) => guide.audience === 'instructors').slice(0, 3);
    for (const guide of newest) await expect(read.getByRole('link', { name: guide.title })).toHaveAttribute('href', guidePath(guide.slug));
  });

  test('every guide is in a sitemap of its own, and a guide that does not exist is not found', async ({ request }) => {
    const sitemap = await (await request.get('/sitemaps/guides.xml')).text();
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? '').pathname);
    expect(listed).toEqual(guides.map((guide) => guidePath(guide.slug)));
    // Each dated by the day its facts were last checked, so search fetches a changed guide sooner (D-387).
    const dated = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
    expect(dated).toEqual(guides.map((guide) => guide.updated));
    expect((await request.get('/guides/no-such-guide')).status()).toBe(404);
  });
});
