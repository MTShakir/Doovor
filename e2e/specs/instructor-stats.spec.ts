import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap, tapThrough } from '../support/helpers';

/** How the week and the month are going, on Today (MNY-01, DIA-04, D-177). */
test.describe('an instructor sees how it is going (MNY-01, D-177)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows what was earned day by day, with the hours booked and the learners taught', async ({ page }, testInfo) => {
    await page.goto('/app/instructor');
    const stats = page.getByRole('region', { name: 'How it is going' });
    await expect(stats).toContainText('This week');

    // Seven bars for the week, each one saying what it holds.
    const week = stats.getByRole('list', { name: 'What you earned each day, this week' });
    await expect(week.getByRole('listitem')).toHaveCount(7);
    await expect(week.getByRole('img').first()).toHaveAttribute('aria-label', /^\w{3} \d{1,2} \w{3} \d{4}: /);

    // The colours are named, so a bar is more than a shape.
    await expect(stats.getByRole('list', { name: 'What the colours mean' })).toContainText('Cash');

    // A description list has no role of its own, so it is found the way the admin figures are.
    const figures = stats.locator('dl[aria-label="Lessons and learners"]');
    await expect(figures).toContainText('Hours booked');
    await expect(figures).toContainText('Active learners');
    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-stats');

    // The month so far, which is a different stretch of days.
    await tapThrough(stats.getByRole('link', { name: 'This month so far' }), /\/app\/instructor\?stats=month$/);
    await expect(page.getByRole('region', { name: 'How it is going' })).toContainText('This month so far');
    await expect(page.getByRole('list', { name: 'What you earned each day, this month so far' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'This month so far' })).toHaveAttribute('aria-current', 'page');
  });
});
