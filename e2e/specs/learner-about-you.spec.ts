import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { clearLearnerHealth, userIdOf } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * What a learner chooses to tell us about a disability (LRN-02, D-180). A learner each, one per
 * width, since a spec that writes an answer would otherwise read the other width's.
 */
test.describe('a learner tells us what helps (LRN-02, D-180)', () => {
  test('saves it, shows it to their instructor, and takes it back', async ({ page, browser }, testInfo) => {
    const email = testInfo.project.name === 'mobile' ? 'noah.wilson@example.com' : 'omar.iqbal@example.com';
    const wording = `Needs quieter roads at first, ${testInfo.project.name}`;
    await clearLearnerHealth(email);

    await signInThroughForm(page, email);
    await page.goto('/app/learner/account/about-you');
    const card = page.getByRole('region', { name: 'A disability or condition' });
    await expect(card).toContainText('It is never used to decide whether you can learn with us.');

    // Saying yes asks what would help, and will not save without it.
    await card.getByLabel('Do you have a disability, condition or learning difficulty?').selectOption('yes');
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('Say what would help, so your instructor can plan for it')).toBeVisible();
    await card.getByLabel('What would help?').fill(wording);
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-about-you');
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. Your instructor can see it.')).toBeVisible();

    // Their instructor reads it on their card, with who told them and when.
    const theirs = await browser.newContext({ storageState: authFile('instructor') });
    try {
      const staff = await theirs.newPage();
      await staff.goto(`/app/instructor/learners/${await userIdOf(email)}`);
      const told = staff.getByRole('region', { name: 'What they told us' });
      await expect(told).toContainText(wording);
      await expect(told).toContainText('only you and the school see it');
    } finally {
      await theirs.close();
    }

    // Taking it back leaves nothing behind.
    await page.reload();
    await card.getByRole('button', { name: 'Take it off my record' }).click();
    await expect(page.getByText('Taken off your record')).toBeVisible();
    await expect(card.getByLabel('Do you have a disability, condition or learning difficulty?')).toHaveValue('');
  });
});
