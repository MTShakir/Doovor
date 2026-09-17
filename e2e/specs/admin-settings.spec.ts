import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { keepPlatformSetting } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
// Only settings no other test depends on are changed here, and each is put back afterwards.
test.describe('platform settings (ADM-05, M5-20)', { tag: '@desktop-only' }, () => {
  test('a super admin changes the switch-on rule and the plan limits, and a value out of range is refused', async ({ browser }, testInfo) => {
    const rule = await keepPlatformSetting('marketplace_switch_on');
    const limits = await keepPlatformSetting('plan_limits');
    const admin = await browser.newContext({ storageState: authFile('admin') });
    try {
      const page = await admin.newPage();
      await page.goto('/admin/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-settings');

      const switchOn = page.getByRole('region', { name: 'Switch-on rule' });
      await switchOn.getByLabel('Verified instructors covering the area').fill('0');
      await switchOn.getByRole('button', { name: 'Save the rule' }).click();
      await expect(switchOn.getByText('Choose between 1 and 1,000 instructors')).toBeVisible();

      await switchOn.getByLabel('Verified instructors covering the area').fill('30');
      await switchOn.getByLabel('Free hours between them').fill('200');
      await switchOn.getByRole('button', { name: 'Save the rule' }).click();
      await expect(page.getByText('Switch-on rule saved')).toBeVisible();
      expect(await rule.read()).toEqual({ verified_instructors: 30, open_hours_14_days: 200 });

      const plans = page.getByRole('region', { name: 'Plan limits' });
      await plans.getByLabel('Pro: texts a month').fill('250');
      await plans.getByRole('button', { name: 'Save plan limits' }).click();
      await expect(page.getByText('Plan limits saved')).toBeVisible();
      expect(await limits.read()).toEqual({ pro: { sms_reminders_per_month: 250 }, school: { sms_reminders_per_month: 200 } });

      // The Regions screen goes by the rule as it now stands.
      await page.goto('/admin/regions');
      await expect(page.getByText('at least 30 verified instructors covering it, with at least 200 free hours between them')).toBeVisible();
    } finally {
      await admin.close();
      await rule.putBack();
      await limits.putBack();
    }
  });

  test('support staff see the settings and cannot change them', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('support') });
    const page = await context.newPage();
    await page.goto('/admin/settings');
    await expect(page.getByText('Only a super admin can change these.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Default booking rules' }).getByLabel('Least notice')).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: /Sign in with Google/ })).toBeDisabled();
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-settings-support', { fullPage: false });
    await context.close();
  });
});
