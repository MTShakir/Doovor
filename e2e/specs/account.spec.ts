import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { makeInstructor, platformIdOf } from '../support/database';
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
    // Their own number on the platform, to quote when they get in touch (D-176).
    await expect(page.getByText(await platformIdOf(email), { exact: true })).toBeVisible();

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
    await sheet.getByLabel('Why are you leaving?').fill('Passed my test');
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

/**
 * The name on the account, and the name of the Business it belongs to (AUTH-09, D-217).
 *
 * An instructor of its own at each width: this test renames somebody, and every other spec that
 * reads a seeded instructor's name would have to be told.
 */
test.describe('your name on your account (AUTH-09, D-217)', () => {
  test('shows the name and the business, and changes both', async ({ page }, testInfo) => {
    const instructor = await makeInstructor(`Namer ${testInfo.project.name}`, '2030-01-01', { listed: false });

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto('/account');
      const details = page.getByRole('region', { name: 'Your details' });
      await expect(details).toContainText(instructor.name);
      await expect(details).toContainText(`${instructor.name} Driving`);

      await details.getByRole('link', { name: 'Change your name' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Your name' })).toBeVisible();
      // Two halves, because that is what a person and a browser both understand (D-196).
      // By role: the row that opened this form is called "Change your business name", which is
      // the same words, and both are on the page while the navigation settles.
      await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Namer');
      await page.getByRole('textbox', { name: 'First name' }).fill('Robin');
      await page.getByRole('textbox', { name: 'Last name' }).fill('Shah');
      await page.getByRole('textbox', { name: 'Your business name' }).fill('Robin Shah School of Motoring');
      await expectAccessible(page);
      await snap(page, testInfo, 'account-name');
      await page.getByRole('button', { name: 'Save name' }).click();

      await expect(page.getByRole('heading', { level: 1, name: 'Account and security' })).toBeVisible();
      await expect(details).toContainText('Robin Shah');
      await expect(details).toContainText('Robin Shah School of Motoring');
    } finally {
      await instructor.remove();
    }
  });
});
