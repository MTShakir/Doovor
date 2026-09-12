import { expect, test } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { enterCode } from '../support/sign-in';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/** Ofcom drama numbers with a fixed local code (D-033), one per viewport. */
function testNumber(project: string): string {
  return project === 'mobile' ? '07700 900007' : '07700 900008';
}

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
    await page.getByLabel('Mobile number').fill(testNumber(testInfo.project.name));
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
