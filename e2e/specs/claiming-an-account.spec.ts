import { expect, test } from '@playwright/test';
import { makeInstructor, withDatabase } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { signInThroughForm } from '../support/sign-in';
import { agreeToTerms, chooseRoleAndCreateAccount } from '../support/sign-up';

/**
 * A learner an instructor added by hand claims the account made for them by signing up with the
 * same email (LRN-03, D-068). Supabase keeps nothing that sign-up said, the password included, so
 * once the email is confirmed they choose the password they will sign in with (D-331).
 */
test.describe('claiming the account an instructor made (LRN-03, D-068, D-331)', () => {
  test('signs up with the same email, chooses a password, and signs in with it after', async ({ browser }, testInfo) => {
    const name = `Claire Claim ${testInfo.project.name}`;
    const email = `claire.claim.${testInfo.project.name}.${String(Date.now())}@example.com`;
    const chosen = 'the password chosen after';

    // An instructor of the test's own adds her, with the email she will claim it by, so no seeded
    // instructor's list grows.
    const instructor = await makeInstructor(`Claim ${testInfo.project.name}`, '2030-01-01', { listed: false });
    try {
      const theirs = await browser.newContext();
      const office = await theirs.newPage();
      await signInThroughForm(office, instructor.email, { next: '/app/instructor/learners' });
      await tapUntil(office.getByRole('button', { name: 'Add a learner' }), office.getByRole('dialog', { name: 'Add a learner' }));
      await office.getByRole('button', { name: 'Add their details' }).click();
      await expect(office.getByRole('button', { name: 'Add them' })).toBeEnabled();
      await office.getByLabel('Their name').fill(name);
      await office.getByLabel('Their email').fill(email);
      await office.getByRole('button', { name: 'Add them' }).click();
      await expect(office.getByRole('link', { name, exact: true })).toBeVisible();
      await theirs.close();

      // She signs up with that email, and confirms it.
      const own = await browser.newContext();
      const page = await own.newPage();
      await chooseRoleAndCreateAccount(page, { card: "I'm learning to drive", heading: 'Create your learner account' }, { fullName: name, email });
      await page.goto(await linkFromEmail(email, 'Confirm your email'));

      // The password typed at sign-up was not kept, so she chooses one now.
      await expect(page.getByRole('heading', { level: 1, name: 'Choose your password' })).toBeVisible();
      await expect(page.getByText('Your instructor or school set up your account for you')).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'claim-choose-password');
      await page.getByLabel('New password').fill(chosen);
      await page.getByRole('button', { name: 'Save password' }).click();

      // The terms ticked at sign-up were not kept either, so she agrees to them once.
      await expect(page).toHaveURL(/\/agree/);
      await agreeToTerms(page);
      await page.getByRole('button', { name: 'Agree and continue' }).click();
      await expect(page).not.toHaveURL(/\/(agree|sign-in)/);
      await own.close();

      // From now on the password she chose is the one that signs her in.
      const later = await browser.newContext();
      const again = await later.newPage();
      await again.goto('/sign-in');
      await again.getByLabel('Email').fill(email);
      await again.getByLabel('Password', { exact: true }).fill(chosen);
      await again.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(again).not.toHaveURL(/\/(sign-in|agree)/);
      await later.close();
    } finally {
      await instructor.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where email = ${email}`;
      });
    }
  });
});
