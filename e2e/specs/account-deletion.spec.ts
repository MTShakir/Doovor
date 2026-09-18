import { expect, test } from '@playwright/test';
import { seedAccounts } from '../support/accounts';
import { accountIdOf, ageDeletionRequest, eraseDueAccountsNow, giveThemAHistory, makeSchoolLearner, whatIsLeftOf } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * Deleting an account: the person goes, the money stays (NFR-PRV-03, AUTH-09, M6-12, D-149).
 *
 * Each test makes its own learner, because an account can only be deleted once and nobody else's
 * test should find theirs gone.
 */
test.describe('deleting your account (NFR-PRV-03, AUTH-09, M6-12)', () => {
  test('asking, and changing your mind while the seven days last', async ({ page }, testInfo) => {
    const learner = await makeSchoolLearner(`Dee Parting ${testInfo.project.name}`, { postcode: 'M1 2QF', transmission: 'manual' });
    try {
      await signInThroughForm(page, learner.email, { next: '/account' });
      const card = page.getByRole('region', { name: 'Delete your account' });
      await expect(card).toContainText('Payment records stay for 6 years without you in them');

      await card.getByRole('button', { name: 'Ask to delete my account' }).click();
      const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
      await expect(sheet).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'delete-account');
      await sheet.getByRole('button', { name: 'Ask to delete my account' }).click();
      await expect(page.getByText('Request received. We will email you.')).toBeVisible();

      // The screen says when it happens, and offers a way out.
      await expect(card).toContainText('Your account goes seven days later');
      // What matters is the screen going back, not the toast that says so: a toast is gone in five
      // seconds and is no proof of anything afterwards.
      await card.getByRole('button', { name: 'Keep my account after all' }).click();
      await expect(card.getByRole('button', { name: 'Ask to delete my account' })).toBeVisible({ timeout: 20_000 });
      await expect(card).not.toContainText('Your account goes seven days later');
    } finally {
      await learner.remove();
    }
  });

  test('acceptance: a deleted account cannot sign in, and its payments stay without the person', async ({ page }, testInfo) => {
    const learner = await makeSchoolLearner(`Gone Learner ${testInfo.project.name}`, { postcode: 'M1 2QF', transmission: 'manual' });
    const id = await accountIdOf(learner.email);
    await giveThemAHistory(id);

    await signInThroughForm(page, learner.email, { next: '/account' });
    await page.getByRole('region', { name: 'Delete your account' }).getByRole('button', { name: 'Ask to delete my account' }).click();
    await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Ask to delete my account' }).click();
    await expect(page.getByText('Request received. We will email you.')).toBeVisible();

    // Seven days on, the sweep carries it out.
    await ageDeletionRequest(learner.email);
    expect(await eraseDueAccountsNow()).toBeGreaterThan(0);

    const left = await whatIsLeftOf(id);
    expect(left.name, 'their name is gone').toBe('Deleted account');
    expect(left.email, 'and their email address').toBeNull();
    expect(left.notes, 'and what a Business wrote about them').toBe(0);
    expect(left.devices, 'and the devices they were told on').toBe(0);
    expect(left.payments, 'while the payment stays, for the six years HMRC asks for').toBe(1);
    expect(left.banned, 'and the account is shut for good').toBe(true);

    // And they cannot get back in.
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(learner.email);
    await page.getByLabel('Password', { exact: true }).fill(seedAccounts().password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Email or password' })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
