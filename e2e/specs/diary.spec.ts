import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/**
 * The diary (DIA-03, DIA-04, M1-19). The seed puts 114 lessons around the seed date, so the
 * tests work from a fixed day rather than whatever today happens to be.
 */
test.describe('instructor diary (DIA-03, DIA-04, M1-19)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows a day, with the state of every lesson on it', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/diary?view=day&date=2026-09-15');
    await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();
    await expect(page.getByText('Tue 15 Sep 2026')).toBeVisible();

    const lessons = page.getByRole('article');
    await expect(lessons.first()).toBeVisible();
    // Every lesson says who it is with, when, and where the money stands (DIA-04).
    await expect(lessons.first()).toContainText(/Paid|Unpaid|Credit|Test day|Cancelled|Pending|Completed/);
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-day');
  });

  test('moves a day at a time, and back to today', async ({ page }) => {
    await page.goto('/app/instructor/diary?view=day&date=2026-09-15');
    // The portal has a Today tab of its own, so this is the diary's own navigation.
    const diary = page.getByRole('navigation', { name: 'Diary' });

    await diary.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/date=2026-09-16/);
    await expect(page.getByText('Wed 16 Sep 2026')).toBeVisible();

    await diary.getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(/date=2026-09-15/);

    await diary.getByRole('link', { name: 'Today' }).click();
    await expect(page).not.toHaveURL(/date=2026-09-15/);
  });

  test('says so plainly when a day is empty', async ({ page }) => {
    // Well past the seeded fortnight.
    await page.goto('/app/instructor/diary?view=day&date=2027-06-14');

    await expect(page.getByText('Nothing booked')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test.describe('diary week view (DIA-03, M1-20)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows a whole week, seven days across', { tag: '@desktop-only' }, async ({ page }, testInfo) => {
    await page.goto('/app/instructor/diary?view=week&date=2026-09-15');

    // Weeks start on Monday, so this is the 14th to the 20th.
    const week = page.getByRole('list').filter({ hasText: 'Mon' }).first();
    await expect(page.getByRole('link', { name: /^Mon 14/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Sun 20/ })).toBeVisible();
    await expect(week).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-week');
  });

  test('a day in the week opens that day', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/diary?view=week&date=2026-09-15');

    await page.getByRole('link', { name: /^Wed 16/ }).click();

    await expect(page).toHaveURL(/view=day&date=2026-09-16/);
    await expect(page.getByText('Wed 16 Sep 2026')).toBeVisible();
  });

  test('shows the day on a phone and the week on a desktop when nobody has chosen', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/diary?date=2026-09-15');

    const mondayHeading = page.getByRole('link', { name: /^Mon 14/ });
    if (testInfo.project.name === 'mobile') {
      await expect(mondayHeading).toBeHidden();
      await expect(page.getByText('3 lessons, 4 hours 30 minutes')).toBeVisible();
    } else {
      await expect(mondayHeading).toBeVisible();
    }
  });
});
