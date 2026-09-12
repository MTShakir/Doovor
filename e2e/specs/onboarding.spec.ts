import { expect, test } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';
import { hasExif, hasGpsTag, jpegWithGps, publicAvatarUrl, webpSize } from '../support/images';
import { linkFromEmail } from '../support/mailpit';
import { testNumber } from '../support/phone-numbers';
import { enterCode } from '../support/sign-in';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

test.describe('instructor onboarding (AUTH-04, M1-02)', () => {
  test('starts after sign-up, survives a reload and finishes in the diary', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'onboarding');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));

    // Mobile verification comes first (AUTH-02), then onboarding.
    await page.getByLabel('Mobile number').fill(testNumber(testInfo, 'onboarding'));
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await enterCode(page, '123456');

    await expect(page).toHaveURL(/\/onboarding\/name$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What should learners call you?' })).toBeVisible();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'onboarding-name');

    // The name is the one step that cannot be skipped.
    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);
    await expect(page.getByText('Step 2 of 5')).toBeVisible();

    // Definition of done: progress survives a reload, and /onboarding resumes it.
    await page.reload();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/onboarding\/badge$/);

    // Guessing a later address does not skip ahead.
    await page.goto('/onboarding/hours');
    await expect(page).toHaveURL(/\/onboarding\/badge$/);

    for (const step of ['area', 'prices', 'hours']) {
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page).toHaveURL(new RegExp(`/onboarding/${step}$`));
    }

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/app\/instructor$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    // Finished means finished: onboarding sends them back to the diary.
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app\/instructor$/);
  });

  test('stores a profile photo without the position it was taken at (M1-03)', async ({ page, request }, testInfo) => {
    const email = uniqueEmail(testInfo, 'photo');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    // The photo does not need a verified mobile, and drama numbers are scarce (D-033).
    await page.getByRole('link', { name: 'Do this later' }).click();
    await expect(page).toHaveURL(/\/onboarding\/name$/);

    // A photo straight off a phone: it really does say where it was taken.
    const original = await jpegWithGps(page);
    expect(hasExif(original)).toBe(true);
    expect(hasGpsTag(original)).toBe(true);

    const upload = page.waitForRequest((r) => r.url().includes('/storage/v1/object/avatars/') && r.method() === 'POST');
    await page.setInputFiles('input[type="file"]', { name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: original });
    const stored = new URL((await upload).url()).pathname.split('/object/avatars/').at(-1) ?? '';
    expect(stored).toMatch(/\.webp$/);
    await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
    // Continue waits for the upload to finish, so nobody saves a half-uploaded photo.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await expectAccessible(page);
    await snap(page, testInfo, 'onboarding-photo');

    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);

    // What anyone can download is a square WebP with no camera metadata left in it.
    const response = await request.get(publicAvatarUrl(stored));
    expect(response.status()).toBe(200);
    const bytes = Buffer.from(await response.body());
    expect(webpSize(bytes)).toEqual({ width: 512, height: 512 });
    expect(hasExif(bytes)).toBe(false);
    expect(hasGpsTag(bytes)).toBe(false);
  });

  test('is only for instructors', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'learner-onboarding');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm learning to drive", heading: 'Create your learner account' },
      { fullName: 'Leo Learner', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await expect(page).toHaveURL(/\/app\/learner$/);

    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app\/learner$/);
  });
});
