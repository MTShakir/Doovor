import { expect, test } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';
import { hasExif, hasGpsTag, jpegWithGps, publicAvatarUrl, publicBadgeUrl, webpSize } from '../support/images';
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

    // A step with its own form is moved past by skipping, not by continuing (AUTH-04).
    for (const step of ['area', 'prices']) {
      await page.getByRole('button', { name: 'Skip for now' }).click();
      await expect(page).toHaveURL(new RegExp(`/onboarding/${step}$`));
    }

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/hours$/);

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

  test('sends the badge for review, and keeps the photo private (M1-04)', async ({ page, request }, testInfo) => {
    const email = uniqueEmail(testInfo, 'badge');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await page.getByRole('link', { name: 'Do this later' }).click();

    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const upload = page.waitForRequest((r) => r.url().includes('/storage/v1/object/badges/') && r.method() === 'POST');
    await page.setInputFiles('input[type="file"]', {
      name: 'badge.jpg',
      mimeType: 'image/jpeg',
      buffer: await jpegWithGps(page),
    });
    const stored = new URL((await upload).url()).pathname.split('/object/badges/').at(-1) ?? '';
    expect(stored).toMatch(/\.webp$/);

    await page.getByLabel('Badge number').fill('123456');
    await page.getByLabel('Badge expiry date').fill('2029-03-31');
    await page.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
    await expectAccessible(page);
    await snap(page, testInfo, 'onboarding-badge');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/area$/);

    // A badge photo shows a name, a number and a face: the public address must not serve it.
    const response = await request.get(publicBadgeUrl(stored));
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('will not submit a badge that has expired (INS-02)', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'expired-badge');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await page.getByRole('link', { name: 'Do this later' }).click();
    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Badge number').fill('123456');
    await page.getByLabel('Badge expiry date').fill('2020-01-31');
    await page.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('That date has passed. Renew your badge first')).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/badge$/);
  });

  test('draws the area as the slider moves (M1-07)', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'area');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await page.getByRole('link', { name: 'Do this later' }).click();
    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/onboarding\/area$/);

    // Eight miles is the default the product sets (COV-01).
    const area = page.getByRole('img', { name: /coverage area/i });
    await expect(area).toHaveAttribute('aria-label', /8 miles/);

    // A postcode the seed already cached, so the suite never waits on postcodes.io.
    await page.getByLabel('Your base postcode').fill('ls6 3qs');
    await expect(area).toHaveAttribute('aria-label', /around LS6 3QS/);

    // Definition of done: the circle follows the slider.
    await page.getByRole('slider', { name: 'How far do you travel' }).press('ArrowRight');
    await expect(page.getByText('9 miles', { exact: true })).toBeVisible();
    await expect(area).toHaveAttribute('aria-label', /9 miles/);
    await expectAccessible(page);
    await snap(page, testInfo, 'onboarding-area');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/onboarding\/prices$/);

    // What was saved comes back, with the circle already drawn.
    await page.goto('/onboarding/area');
    await expect(page.getByLabel('Your base postcode')).toHaveValue('LS6 3QS');
    await expect(page.getByText('9 miles', { exact: true })).toBeVisible();
  });

  test('will not save an area without a real postcode (COV-03)', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'bad-postcode');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm an instructor", heading: 'Create your instructor account' },
      { fullName: 'Nina Newstart', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await page.getByRole('link', { name: 'Do this later' }).click();
    await page.getByLabel('Your name').fill('Nina Newstart');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();

    await page.getByLabel('Your base postcode').fill('Leeds');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Enter a UK postcode like LS1 4DY')).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/area$/);
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
