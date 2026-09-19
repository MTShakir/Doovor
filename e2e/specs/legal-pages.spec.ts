import { expect, test } from '@playwright/test';
import { expectAccessible, robotsOf, settled, snap } from '../support/helpers';

/**
 * The pages the law asks a site to carry (NFR-PRV-02, PRD 15, M6-07).
 *
 * They are drafts until a solicitor has been through them, and the point of this spec is that
 * nobody can mistake one for the finished thing: the page says so at the top, and every gap only a
 * solicitor may fill says so where it stands.
 */
const pages = [
  { path: '/privacy', title: 'Privacy notice', gaps: 5 },
  { path: '/cookies', title: 'Cookies', gaps: 1 },
  { path: '/terms', title: 'Terms for learners', gaps: 3 },
  { path: '/business-terms', title: 'Terms for instructors and schools', gaps: 3 },
];

test.describe('the legal pages (NFR-PRV-02, M6-07)', () => {
  for (const { path, title, gaps } of pages) {
    test(`${path} is a marked draft`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

      // Nobody may take a draft for the real thing.
      const notice = page.getByRole('complementary', { name: 'Draft notice' });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('This page is a draft.');
      await expect(page.getByText('Not yet checked by a solicitor.')).toBeVisible();

      // And every gap says whose job it is, where it stands.
      await expect(page.getByText('For the solicitor')).toHaveCount(gaps);

      // A legal page is meant to be found.
      expect(await robotsOf(page)).toBeNull();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, `legal${path.replace(/\//g, '-')}`);
    });
  }

  test('the accessibility statement stands on its own, and says how it was made', async ({ page }, testInfo) => {
    await page.goto('/accessibility');
    await expect(page.getByRole('heading', { level: 1, name: 'Accessibility' })).toBeVisible();
    // This one is ours to write, so it is not a draft and it has no gaps.
    await expect(page.getByRole('complementary', { name: 'Draft notice' })).toHaveCount(0);
    await expect(page.getByText('For the solicitor')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'What we know is not right yet' })).toBeVisible();
    await expect(page.getByText('Web Content Accessibility Guidelines 2.2 at level AA')).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'legal-accessibility');
  });

  test('every one of them is reachable from the foot of any page', async ({ page }) => {
    await page.goto('/pricing');
    const footer = page.getByRole('contentinfo');
    for (const { path } of [...pages, { path: '/accessibility' }]) {
      await expect(footer.locator(`a[href="${path}"]`), `${path} is in the footer`).toHaveCount(1);
    }
  });

  test('and the sitemap lists them', async ({ page }) => {
    const answer = await page.request.get('/sitemaps/pages.xml');
    expect(answer.status()).toBe(200);
    const xml = await answer.text();
    for (const { path } of [...pages, { path: '/accessibility' }]) {
      expect(xml, `${path} is in the sitemap`).toContain(`${path}</loc>`);
    }
  });
});
