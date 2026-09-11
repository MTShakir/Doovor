import { expect, test } from '@playwright/test';
import { authFile, type RoleKey } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

const portals: { role: RoleKey; path: string; title: string; mobileTabs: string[] }[] = [
  { role: 'learner', path: '/app/learner', title: 'Home', mobileTabs: ['Home', 'Lessons', 'Progress', 'Account'] },
  { role: 'instructor', path: '/app/instructor', title: 'Today', mobileTabs: ['Today', 'Diary', 'Learners', 'Money', 'More'] },
  { role: 'schoolManager', path: '/app/school', title: 'Overview', mobileTabs: ['Overview', 'Diary', 'Instructors', 'Learners', 'More'] },
];

test.describe('portal shells (PRD 8.2, M0-14)', () => {
  for (const portal of portals) {
    test.describe(portal.path, () => {
      test.use({ storageState: authFile(portal.role) });

      test('shows the right navigation and passes axe', async ({ page, isMobile }, testInfo) => {
        await page.goto(portal.path);
        await expect(page.getByRole('heading', { level: 1, name: portal.title })).toBeVisible();
        const nav = page.getByRole('navigation', { name: 'Main' });
        if (isMobile) {
          await expect(nav.getByRole('link')).toHaveText(portal.mobileTabs);
        } else {
          await expect(nav.getByRole('link', { name: portal.title })).toHaveAttribute('aria-current', 'page');
          await expect(page.getByRole('link', { name: 'Account and security' })).toBeVisible();
        }
        await expectAccessible(page);
        await snap(page, testInfo, portal.path.replaceAll('/', '_').slice(1));
      });
    });
  }

  test.describe('navigation', () => {
    test.use({ storageState: authFile('instructor') });

    test('moving between tabs marks the new one as current', async ({ page }) => {
      await page.goto('/app/instructor');
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Diary' }).click();
      await expect(page).toHaveURL(/\/app\/instructor\/diary$/);
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Diary' })).toHaveAttribute('aria-current', 'page');
    });

    // More is a phone tab; desktop shows the same links in the sidebar.
    test('the More tab offers account, security and sign out', { tag: '@phone-only' }, async ({ page }, testInfo) => {
      await page.goto('/app/instructor/more');
      await expect(page.getByRole('link', { name: 'Account and security' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await snap(page, testInfo, 'instructor-more');
    });

    test('unknown sections show not found and are never indexed', async ({ page }) => {
      // Streamed responses keep a 200 status; Next marks them noindex instead (D-031).
      await page.goto('/app/instructor/does-not-exist');
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    });
  });

  test.describe('admin', () => {
    test.use({ storageState: authFile('admin') });

    test('is desktop only', async ({ page, isMobile }, testInfo) => {
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
  });
});
