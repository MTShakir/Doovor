import { expect, test, type Locator } from '@playwright/test';
import { brand } from '@repo/config/brand';
import { authFile, seedAccounts } from '../support/accounts';
import { authenticatorsOf, giveAuthenticator, makeSchool, makeSchoolLearner } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** Whether a person's panel says two-step verification is on. */
function twoStep(panel: Locator): Locator {
  return panel.locator('dt', { hasText: /^Two-step verification$/ }).locator('xpath=following-sibling::dd');
}

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('people for platform staff (ADM-02, M5-18)', { tag: '@desktop-only' }, () => {
  test('a super admin suspends a learner, who is signed out and cannot sign in, and reactivates them', async ({ page, browser }, testInfo) => {
    const learner = await makeSchoolLearner('Lara Locked', { postcode: 'M13 9PL', transmission: 'manual' });
    const admin = await browser.newContext({ storageState: authFile('admin') });
    const staff = await admin.newPage();
    try {
      // The learner is signed in on their own device.
      await signInThroughForm(page, learner.email);
      await expect(page).toHaveURL(/\/app\/learner$/);

      // Found by their email, and opened.
      await staff.goto('/admin/learners');
      await expect(staff.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
      await staff.getByLabel('Search learners').fill(learner.email);
      await staff.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(staff.getByText('1 learner found')).toBeVisible();
      await staff.getByRole('button', { name: new RegExp(`^${learner.name}`) }).click();
      const panel = staff.getByRole('dialog', { name: learner.name });
      await expect(panel.getByRole('region', { name: 'Learns with' })).toContainText('Quayside Driving School');
      await panel.getByRole('button', { name: 'Suspend account' }).click();

      const question = staff.getByRole('dialog', { name: `Suspend ${learner.name}?` });
      await question.getByLabel('Why?').fill('Abusive messages to two instructors.');
      await question.getByRole('button', { name: 'Suspend' }).click();
      await expect(staff.getByText(`${learner.name} is suspended and signed out everywhere`)).toBeVisible();
      const suspended = staff.getByRole('dialog', { name: learner.name });
      await expect(suspended.getByText(/^Suspended on \w{3} \d{1,2} \w{3} by /)).toBeVisible();
      await expect(suspended).toContainText('Abusive messages to two instructors.');
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-person-suspended', { fullPage: false });

      // Their device is signed out at once, and signing in again is refused with a reason.
      await page.reload();
      await expect(page).toHaveURL(/\/sign-in/);
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(learner.email);
      await page.getByLabel('Password', { exact: true }).fill(seedAccounts().password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByText(`This account is suspended. Email ${brand.supportEmail} to talk to us about it.`)).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'sign-in-suspended', { fullPage: false });

      // Reactivated, they sign in as before.
      await suspended.getByRole('button', { name: 'Reactivate account' }).click();
      await expect(staff.getByText(`${learner.name} can sign in again`)).toBeVisible();
      await expect(staff.getByRole('dialog', { name: learner.name }).getByRole('button', { name: 'Suspend account' })).toBeVisible();
      await signInThroughForm(page, learner.email);
      await expect(page).toHaveURL(/\/app\/learner$/);
    } finally {
      await admin.close();
      await learner.remove();
    }
  });

  test('a super admin resets the two-step verification of somebody who works for a Business, from its panel', async ({ browser }, testInfo) => {
    const school = await makeSchool('Reset');
    await giveAuthenticator(school.managerEmail);
    const admin = await browser.newContext({ storageState: authFile('admin') });
    const staff = await admin.newPage();
    try {
      await staff.goto(`/admin/businesses?q=${encodeURIComponent(school.name)}`);
      await staff.getByRole('button', { name: new RegExp(`^${school.name}`) }).click();
      await staff.getByRole('dialog', { name: school.name }).getByRole('button', { name: /^Mo Reset/ }).click();

      const panel = staff.getByRole('dialog', { name: 'Mo Reset' });
      await expect(twoStep(panel)).toHaveText('On');
      await expect(panel.getByRole('region', { name: 'Works for' })).toContainText(`${school.name}Manager`);
      await panel.getByRole('button', { name: 'Reset two-step verification' }).click();

      const question = staff.getByRole('dialog', { name: 'Reset two-step verification for Mo Reset?' });
      await expect(question).toContainText('Resetting it for somebody else is how an account is taken over.');
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-person-reset', { fullPage: false });
      await question.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(staff.getByText('Two-step verification is reset for Mo Reset')).toBeVisible();
      await expect(twoStep(staff.getByRole('dialog', { name: 'Mo Reset' }))).toHaveText('Off');
      await expect(staff.getByRole('dialog', { name: 'Mo Reset' }).getByRole('button', { name: 'Reset two-step verification' })).toHaveCount(0);
      expect(await authenticatorsOf(school.managerEmail)).toBe(0);
    } finally {
      await admin.close();
      await school.remove();
    }
  });

  test('support staff open a person, and cannot change their account', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('support') });
    const page = await context.newPage();
    await page.goto('/admin/instructors?q=emma.clarke');
    await expect(page.getByText('1 instructor found')).toBeVisible();
    await page.getByRole('button', { name: /^Emma Clarke/ }).click();
    const panel = page.getByRole('dialog', { name: 'Emma Clarke' });
    await expect(panel.getByRole('region', { name: 'Works for' })).toContainText('Quayside Driving School');
    await expect(panel.getByText('Only a super admin can suspend an account or reset two-step verification.')).toBeVisible();
    await expect(panel.getByRole('button', { name: /Suspend|Reset/ })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-person-support', { fullPage: false });
    await context.close();
  });
});
