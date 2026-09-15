import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, settled, snap, tapThrough } from '../support/helpers';

/**
 * The money dashboard (MNY-01, M3-21): this week, this month and this tax year.
 *
 * What the figures add up to is proved in pgTAP, where every payment is known. Here the screen is
 * checked: the periods, the tax year running from 6 April to 5 April, and who sees what. Other
 * tests take payments at the same time, so no figure here is compared with a number.
 */
test.describe('the money dashboard (MNY-01, M3-21)', () => {
  test('the owner of a school sees the whole Business, for a week, a month and the tax year', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    await page.goto('/app/school/money');

    const dashboard = page.getByRole('region', { name: 'Money in' });
    const periods = dashboard.getByRole('navigation', { name: 'Period' });
    await expect(periods.getByRole('link', { name: 'This week' })).toHaveAttribute('aria-current', 'page');
    await expect(dashboard).toContainText(/Mon \d{1,2} \w{3} \d{4} to Sun \d{1,2} \w{3} \d{4}/);
    for (const label of ['Paid', 'Unpaid', 'Credit sold', 'Refunds']) {
      await expect(dashboard.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
    }
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'money-dashboard-week');

    await tapThrough(periods.getByRole('link', { name: 'Tax year' }), /period=tax_year/);
    await expect(periods.getByRole('link', { name: 'Tax year' })).toHaveAttribute('aria-current', 'page');
    await expect(dashboard).toContainText(/6 Apr \d{4} to \w{3} 5 Apr \d{4}/);
    await expect(dashboard.getByRole('list').or(dashboard.locator('dl'))).toHaveAttribute('aria-label', /^\d{4} to \d{4} tax year$/);
    await settled(page);
    await snap(page, testInfo, 'money-dashboard-tax-year');

    await periods.getByRole('link', { name: 'This month' }).click();
    await expect(periods.getByRole('link', { name: 'This month' })).toHaveAttribute('aria-current', 'page');
    await expect(dashboard).toContainText(/1 \w{3} \d{4} to \w{3} \d{1,2} \w{3} \d{4}/);
    await context.close();
  });

  test('an instructor at the school sees their own lessons, and no credit sold', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolInstructor') });
    const page = await context.newPage();
    await page.goto('/app/instructor/money');

    const dashboard = page.getByRole('region', { name: 'Money in' });
    await expect(dashboard).toContainText('Your own lessons.');
    await expect(dashboard.getByRole('term').filter({ hasText: /^Paid$/ })).toBeVisible();
    await expect(dashboard.getByRole('term').filter({ hasText: /^Credit sold$/ })).toHaveCount(0);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'money-dashboard-instructor');
    await context.close();
  });
});
