import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/** The learner's own five questions (AUTH-06, R-16, M2-01). */
test.describe('learner onboarding (AUTH-06, M2-01)', () => {
  test('asks once, then opens their portal', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'learner-about');
    await chooseRoleAndCreateAccount(
      page,
      { card: "I'm learning to drive", heading: 'Create your learner account' },
      { fullName: 'Leo Learner', email },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));

    await expect(page).toHaveURL(/\/onboarding\/about-you$/);
    await expect(page.getByRole('heading', { level: 1, name: 'A few things about you' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled();
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-about-you');

    // A learner has to be 16, and is told so before anything is saved.
    await page.getByLabel('Your name').fill('Leo Learner');
    await page.getByLabel('Your postcode').fill('ls6 3qs');
    await page.getByLabel('Which gearbox?').selectOption('manual');
    await page.getByLabel('How far along are you?').selectOption('none');
    await page.getByLabel('Date of birth').fill('2015-05-05');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('You have to be 16 to start learning to drive')).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/about-you$/);

    await page.getByLabel('Date of birth').fill('2007-05-05');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/app\/learner$/);

    // Asked once: coming back does not ask again.
    await page.goto('/onboarding/about-you');
    await expect(page).toHaveURL(/\/app\/learner$/);
  });

  test('a learner who has answered is not asked again', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('learner') });
    const page = await context.newPage();

    await page.goto('/onboarding/about-you');

    await expect(page).toHaveURL(/\/app\/learner$/);
    await context.close();
  });
});
