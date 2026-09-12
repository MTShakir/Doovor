import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

test.describe('instructor Today screen (PRD 10.1, M1-10)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows a checklist that reflects what is actually set up', async ({ page }, testInfo) => {
    await page.goto('/app/instructor');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // The seeded instructor has learners and an approved badge, but no payments account.
    const checklist = page.getByRole('progressbar', { name: 'Setup checklist' });
    await expect(checklist).toHaveAttribute('aria-valuenow', '67');
    await expect(page.getByText('2 of 3 done')).toBeVisible();

    const learner = page.getByRole('link', { name: /Add your first learner/ });
    await expect(learner).toContainText('Your first learner is on board');
    await expect(learner).toContainText('Done');
    await expect(page.getByRole('link', { name: /Share your booking link/ })).toContainText('is live');
    await expect(page.getByRole('link', { name: /Connect payments/ })).toContainText('Not done yet');

    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-today');
  });

  test('each row opens the screen that finishes it', async ({ page }) => {
    await page.goto('/app/instructor');
    await page.getByRole('link', { name: /Connect payments/ }).click();

    await expect(page).toHaveURL(/\/app\/instructor\/money$/);
  });
});
