import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible } from '../support/helpers';

/**
 * What somebody teaching under a school sees on the screens made for a business of their own.
 * The books and the colours are the Business's, and both screens were empty; Your school told
 * them they were not at a school at all (D-374).
 */
test.describe('teaching under a school (D-374)', () => {
  test.use({ storageState: authFile('schoolInstructor') });

  test('the books and the colours say the school looks after them', async ({ page }) => {
    await page.goto('/app/instructor/books');
    await expect(page.getByRole('heading', { level: 1, name: 'Bookkeeping' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your school looks after this' })).toBeVisible();

    await page.goto('/app/instructor/colours');
    await expect(page.getByRole('heading', { level: 1, name: 'Your booking colours' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your school looks after this' })).toBeVisible();
    await expectAccessible(page);
  });

  test('Your school names the school they teach for', async ({ page }) => {
    await page.goto('/app/instructor/school');
    await expect(page.getByRole('heading', { name: 'You teach for Quayside Driving School' })).toBeVisible();
    await expect(page.getByText('You are not linked to a school')).toHaveCount(0);
    await expectAccessible(page);
  });
});
