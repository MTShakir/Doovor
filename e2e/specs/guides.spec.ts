import { brand } from '@repo/config/brand';
import { audienceLabels, guideAuthor, guidePath, guides } from '@repo/core/guides';
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
      '@graph': { '@type': string }[];
    };
    expect(structured['@graph'].map((node) => node['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '').pathname).toBe(guidePath(guide.slug));
    const image = new URL((await page.locator('meta[property="og:image"]').first().getAttribute('content')) ?? '');
    expect(image.pathname).toBe(`${guidePath(guide.slug)}/share.png`);
    expect((await request.get(`${image.pathname}${image.search}`)).headers()['content-type']).toBe('image/png');

    await expect(page.getByRole('link', { name: 'Create your free account' }).last()).toHaveAttribute('href', /\/sign-up\?role=instructor$/);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'guide', { fullPage: true });
  });

  test('every guide is in a sitemap of its own, and a guide that does not exist is not found', async ({ request }) => {
    const sitemap = await (await request.get('/sitemaps/guides.xml')).text();
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? '').pathname);
    expect(listed).toEqual(guides.map((guide) => guidePath(guide.slug)));
    expect((await request.get('/guides/no-such-guide')).status()).toBe(404);
  });
});
