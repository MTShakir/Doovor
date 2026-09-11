import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const iPhoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';

/** Another device signed in to the same account. */
async function signInElsewhere(browser: Browser, email: string, userAgent?: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(userAgent ? { userAgent } : {});
  const page = await context.newPage();
  await signInThroughForm(page, email);
  return { context, page };
}

/** A device whose session has ended is sent to sign in on its next visit, not an hour later. */
async function expectSignedOut(page: Page): Promise<void> {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
}

test.describe('account and security (AUTH-09)', () => {
  test('shows devices, signs out another device and takes a deletion request', async ({ page, browser }, testInfo) => {
    const email = testInfo.project.name === 'mobile' ? 'harry.thomas@example.com' : 'noah.wilson@example.com';
    const phone = await signInElsewhere(browser, email, iPhoneSafari);

    await signInThroughForm(page, email);
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Account and security' })).toBeVisible();
    const devices = page.getByRole('region', { name: 'Devices' });
    await expect(page.getByText('This device')).toBeVisible();
    await expect(page.getByText('Safari on iPhone', { exact: true })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'account');

    // Each button says which device it signs out, for screen readers.
    await devices.getByRole('button', { name: /^Sign out Safari on iPhone, last active / }).click();
    await expect(page.getByText('Device signed out')).toBeVisible();
    await expect(page.getByText('Safari on iPhone', { exact: true })).toBeHidden();
    await expectSignedOut(phone.page);
    await phone.context.close();

    await page.getByRole('button', { name: 'Ask to delete my account' }).click();
    const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Why are you leaving? (optional)').fill('Passed my test');
    await sheet.getByRole('button', { name: 'Ask to delete my account' }).click();
    await expect(page.getByText(/We received your request on/)).toBeVisible();
  });

  test('signing out of all devices ends every session at once', async ({ page, browser }, testInfo) => {
    // Accounts no other spec signs in with: this ends every one of their sessions.
    const email = testInfo.project.name === 'mobile' ? 'olivia.brown@example.com' : 'tom.walsh@example.com';
    const laptop = await signInElsewhere(browser, email);

    await signInThroughForm(page, email);
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out of all devices' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expectSignedOut(laptop.page);
    await laptop.context.close();
  });
});
