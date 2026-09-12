import { expect, test } from '@playwright/test';
import { jpegWithGps } from '../support/images';
import { linkFromEmail } from '../support/mailpit';
import { testNumber } from '../support/phone-numbers';
import { enterCode } from '../support/sign-in';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/** The milestone's own claim: an instructor is set up in under five minutes, on a phone. */
const FIVE_MINUTES = 5 * 60 * 1000;

test.describe('an instructor sets up in five minutes (AUTH-04, M1-24)', { tag: '@phone-only' }, () => {
  test('signs up, fills in every step and lands on Today', async ({ page }, testInfo) => {
    const started = Date.now();
    const email = uniqueEmail(testInfo, 'timed');

    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nadia Fresh', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));

    // AUTH-02: the mobile number, by text.
    await page.getByLabel('Mobile number').fill(testNumber(testInfo, 'onboarding-timed'));
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await enterCode(page, '123456');
    await expect(page).toHaveURL(/\/onboarding\/name$/);

    // Step 1: name and photo.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    const photo = await jpegWithGps(page);
    const avatar = page.waitForRequest((r) => r.url().includes('/storage/v1/object/avatars/') && r.method() === 'POST');
    await page.setInputFiles('input[type="file"]', { name: 'me.jpg', mimeType: 'image/jpeg', buffer: photo });
    await avatar;
    await page.getByLabel('Your name').fill('Nadia Fresh');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);

    // Step 2: the badge, sent for checking.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    const badge = page.waitForRequest((r) => r.url().includes('/storage/v1/object/badges/') && r.method() === 'POST');
    await page.setInputFiles('input[type="file"]', { name: 'badge.jpg', mimeType: 'image/jpeg', buffer: photo });
    await badge;
    await page.getByLabel('Badge number').fill('729481');
    await page.getByLabel('Badge expiry date').fill('2029-08-31');
    await page.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/area$/);

    // Step 3: where they teach.
    await page.getByLabel('Your base postcode').fill('LS6 3QS');
    await page.getByRole('slider', { name: 'How far do you travel' }).press('ArrowRight');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/prices$/);

    // Step 4: what it costs.
    await page.getByLabel('Price for an hour').fill('40');
    await page.getByLabel(/Price for 10 hours/).fill('370');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/hours$/);

    // Step 5: when they work.
    await page.getByRole('button', { name: 'Saturday' }).click();
    await page.getByLabel('From').fill('08:30');
    await page.getByLabel('To').fill('19:00');
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page).toHaveURL(/\/app\/instructor$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    // What they see next: three things to do, and the booking link waiting on the badge check.
    await expect(page.getByText('0 of 3 done')).toBeVisible();

    const elapsed = Date.now() - started;
    testInfo.annotations.push({ type: 'elapsed', description: `${String(Math.round(elapsed / 100) / 10)} seconds` });
    expect(elapsed, 'setting up an instructor takes under five minutes').toBeLessThan(FIVE_MINUTES);
  });
});
