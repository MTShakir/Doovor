import { expect, test } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';

const portals = [
  { path: '/app/learner', title: 'Home', mobileTabs: ['Home', 'Lessons', 'Progress', 'Account'] },
  { path: '/app/instructor', title: 'Today', mobileTabs: ['Today', 'Diary', 'Learners', 'Money', 'More'] },
  { path: '/app/school', title: 'Overview', mobileTabs: ['Overview', 'Diary', 'Instructors', 'Learners', 'More'] },
] as const;

test.describe('portal shells (PRD 8.2, M0-14)', () => {
  for (const portal of portals) {
    test(`${portal.path} shows the right navigation`, async ({ page, isMobile }, testInfo) => {
      await page.goto(portal.path);
      await expect(page.getByRole('heading', { level: 1, name: portal.title })).toBeVisible();
      const nav = page.getByRole('navigation', { name: 'Main' });
      if (isMobile) {
        await expect(nav.getByRole('link')).toHaveText([...portal.mobileTabs]);
      } else {
        await expect(nav.getByRole('link', { name: portal.title })).toHaveAttribute('aria-current', 'page');
      }
      await expectAccessible(page);
      await snap(page, testInfo, portal.path.replaceAll('/', '_').slice(1));
    });
  }

  test('navigating marks the new tab as current', async ({ page }) => {
    await page.goto('/app/instructor');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Diary' }).click();
    await expect(page).toHaveURL(/\/app\/instructor\/diary$/);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Diary' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('admin is desktop only', async ({ page, isMobile }, testInfo) => {
    await page.goto('/admin');
    if (isMobile) {
      await expect(page.getByRole('heading', { name: 'Use a larger screen' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Audit log' })).toBeVisible();
    }
    await expectAccessible(page);
    await snap(page, testInfo, 'admin');
  });

  test('unknown sections show not found and are never indexed', async ({ page }) => {
    // Streamed responses keep a 200 status; Next marks them noindex instead (see D-031).
    await page.goto('/app/instructor/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });
});
