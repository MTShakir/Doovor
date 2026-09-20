import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeTakings } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('what the platform earned (ADM-01, ADM-10, D-174)', { tag: '@desktop-only' }, () => {
  test.use({ storageState: authFile('admin') });

  test('shows the fees kept, who paid them and the plans, over the days chosen', async ({ page }, testInfo) => {
    const takings = await makeTakings('Payments');
    try {
      await page.goto('/admin/payments');
      await expect(page.getByRole('heading', { level: 1, name: 'Payments' })).toBeVisible();

      // The school made for this test paid a 50p fee just now, so it is in today's figures.
      await page.goto('/admin/payments?range=today');
      const earned = page.getByRole('region', { name: 'Who paid the platform' });
      const row = earned.getByRole('link', { name: new RegExp(takings.name) });
      await expect(row).toContainText('£0.50');
      await expect(row).toContainText('1 payment');

      // Plans are about now, whatever the days: nobody is charged for one yet (D-161).
      const plans = page.getByRole('region', { name: 'Plans' });
      await expect(plans).toContainText('Nothing is charged for a plan yet');
      await expect(plans.getByRole('term').filter({ hasText: 'Free' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-payments');

      // A week in 2024: the platform earned nothing, and the screen says so.
      await page.goto('/admin/payments?from=2024-01-01&to=2024-01-07');
      await expect(page.getByText('No payment carried a platform fee in these days.')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Mon 1 Jan 2024 to Sun 7 Jan 2024' })).toBeVisible();
    } finally {
      await takings.remove();
    }
  });

  test('has no Bookings screen: lessons are looked into through the person (D-174)', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Bookings' })).toHaveCount(0);
    const gone = await page.goto('/admin/bookings');
    expect(gone?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
