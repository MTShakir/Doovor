import { brand } from '@repo/config/brand';
import { sitePagePaths } from '@repo/core/sitemap';
import { foundingOffer, plans } from '@repo/config/plans';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectAccessible, settled, snap } from '../support/helpers';

/** Whole pounds, as the site writes them. */
const pounds = (pence: number): string => `£${String(pence / 100)}`;

/** Follows a link in the site header: the menu on a phone, the header's own links on a wide screen. */
async function openFromHeader(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('Menu', { exact: true }).click();
    await page.getByRole('navigation', { name: 'Site pages' }).getByRole('link', { name: label, exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
  }
}

/**
 * The public site's own pages (PRD 8.3, 9.18, M5-09): each opens from the header, says who it is
 * for, and leads to the right sign-up; pricing comes from the configuration.
 */
test.describe('the public site (PRD 8.3, 9.18, M5-09)', () => {
  test('each page opens from the header, says who it is for, and leads to its own sign-up', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Driving lessons, sorted.' })).toBeVisible();
    await expect(page).toHaveTitle(`${brand.name}: book, pay and track driving lessons`);
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute('href', /\/start$/);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'site-home');

    const pages = [
      { nav: 'Learners', path: '/learners', heading: 'Learn to drive, without the admin', action: 'Create a learner account', role: 'learner', shot: 'site-learners' },
      { nav: 'Instructors', path: '/instructors-software', heading: 'Run your driving lessons from your phone', action: 'Create your free account', role: 'instructor', shot: 'site-instructors' },
      { nav: 'Schools', path: '/driving-schools-software', heading: 'Your whole driving school in one place', action: 'Set up your school', role: 'school', shot: 'site-schools' },
    ];
    for (const one of pages) {
      await openFromHeader(page, testInfo, one.nav);
      await expect(page).toHaveURL(new RegExp(`${one.path}$`));
      await expect(page.getByRole('heading', { level: 1, name: one.heading })).toBeVisible();
      await expect(page.getByRole('link', { name: one.action }).first()).toHaveAttribute('href', new RegExp(`/sign-up\\?role=${one.role}$`));
      expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '').pathname).toBe(one.path);
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, one.shot);
    }
  });

  test('pricing shows each plan at its configured price, what it has now and what comes later, and the founding offer', async ({ page }, testInfo) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1, name: 'Simple pricing' })).toBeVisible();

    const offer = page.getByRole('region', { name: `The paid plan free for ${String(foundingOffer.months)} months` });
    await expect(offer).toContainText(`first ${String(foundingOffer.instructorLimit)} independent instructors`);
    await expect(offer).toContainText(`first ${String(foundingOffer.schoolLimit)} driving schools`);

    const free = page.getByRole('article', { name: 'Free' });
    await expect(free).toContainText(pounds(plans.free.monthlyPricePence));
    await expect(free.getByRole('list', { name: 'In Free' })).toContainText('Card, cash and bank transfer payments');

    const pro = page.getByRole('article', { name: 'Pro' });
    await expect(pro).toContainText(pounds(plans.pro.monthlyPricePence));
    await expect(pro).toContainText(`per month, or ${pounds(plans.pro.yearlyPricePence ?? 0)} a year`);
    await expect(pro.getByRole('list', { name: 'In Pro' })).toContainText(`Text message reminders, up to ${String(plans.pro.entitlements.smsRemindersPerMonth)} a month`);
    // Sold as coming, never as there (D-116).
    await expect(pro.getByRole('list', { name: 'In Pro' })).not.toContainText('calendar sync');
    await expect(pro.getByRole('list', { name: 'Coming later to Pro' })).toContainText('Google and Outlook calendar sync');

    const school = page.getByRole('article', { name: 'School' });
    await expect(school).toContainText(pounds(plans.school.monthlyPricePence));
    await expect(school).toContainText(`for at least ${String(plans.school.minimumInstructors)} instructors`);
    await expect(school.getByRole('link', { name: 'Set up your school on School' })).toHaveAttribute('href', /\/sign-up\?role=school$/);

    await expect(page.getByRole('region', { name: 'Card payments' })).toContainText('about 1.5% plus 20p');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'site-pricing');
  });

  test('every page of the site shares the header and a footer that links each city page, and search is told about them', async ({ page, request }) => {
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: brand.name })).toHaveAttribute('href', '/');
    const footer = page.getByRole('contentinfo');
    for (const city of ['Leeds', 'London', 'Manchester']) {
      await expect(footer.getByRole('link', { name: `Driving lessons in ${city}` })).toHaveAttribute('href', `/driving-lessons/${city.toLowerCase()}`);
    }
    await expect(footer.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', `mailto:${brand.supportEmail}`);

    const sitemap = await request.get('/sitemaps/pages.xml');
    const listed = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? '').pathname);
    expect(listed).toEqual([...sitePagePaths]);

    // A shared link to any of them previews with the site's own image.
    await page.goto('/pricing');
    const image = new URL((await page.locator('meta[property="og:image"]').first().getAttribute('content')) ?? '');
    expect(image.pathname).toBe('/share.png');
    const drawn = await request.get(`${image.pathname}${image.search}`);
    expect(drawn.headers()['content-type']).toBe('image/png');
  });
});
