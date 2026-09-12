import { expect, test, type Browser } from '@playwright/test';
import { authFile } from '../support/accounts';
import { learnerInstructorName } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { uniqueEmail } from '../support/sign-up';

/** Makes an invitation as the seeded instructor and returns the link she would send. */
async function inviteLink(browser: Browser, learner: { fullName: string; email: string }): Promise<string> {
  const context = await browser.newContext({ storageState: authFile('instructor') });
  const page = await context.newPage();
  await page.goto('/app/instructor/learners');
  // Typing before hydration fights the form that is about to take over (D-043).
  await expect(page.getByRole('button', { name: 'Make the link' })).toBeEnabled();
  await page.getByLabel('Their name').fill(learner.fullName);
  await page.getByLabel('How will you send it?').selectOption('email');
  await page.getByLabel('Their email').fill(learner.email);
  await page.getByRole('button', { name: 'Make the link' }).click();
  const link = await page.getByLabel('Their link').inputValue();
  await context.close();
  return link;
}

test.describe('inviting a learner (AUTH-07, M2-03)', () => {
  test.describe('the instructor', () => {
    test.use({ storageState: authFile('instructor') });

    test('makes a link and hands it to the app they already use', async ({ page }, testInfo) => {
      await page.goto('/app/instructor/learners');
      await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeEnabled();
      await expectAccessible(page);
      await snap(page, testInfo, 'instructor-invite');

      // WhatsApp is the default, so the mobile number is what it asks for.
      await page.getByLabel('Their name').fill('Priya Patel');
      await page.getByLabel('Their mobile number').fill('07700 900123');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByLabel('Their link')).toHaveValue(/\/invite\/[A-Za-z0-9_-]{20,}$/);
      const share = page.getByRole('link', { name: 'Send it' });
      await expect(share).toHaveAttribute('href', /^https:\/\/wa\.me\/447700900123\?text=Hi%20Priya%20Patel/);
      await expect(page.getByText('Book your driving lessons with me here')).toBeVisible();
      // A link is one long word: it must not push the page sideways on a phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAccessible(page);
      await snap(page, testInfo, 'instructor-invite-ready');
    });

    test('asks for an address when the channel needs one', async ({ page }) => {
      await page.goto('/app/instructor/learners');
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeEnabled();
      await page.getByLabel('How will you send it?').selectOption('email');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByText('Enter an email address to send it to')).toBeVisible();
      await expect(page.getByLabel('Their link')).toBeHidden();
    });
  });

  test('a stranger opens the link, signs up, and lands linked', async ({ page, browser }, testInfo) => {
    const email = uniqueEmail(testInfo, 'invited');
    const link = await inviteLink(browser, { fullName: 'Priya Patel', email });

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan would like to teach you' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'invite-landing');

    // The invitation knows who it was for, so nothing is retyped on a phone.
    await page.getByRole('link', { name: 'Create my account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create your learner account' })).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Priya Patel');
    await expect(page.getByLabel('Email')).toHaveValue(email);

    await page.getByLabel('Password', { exact: true }).fill('a long pass phrase');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    await page.goto(await linkFromEmail(email, 'Confirm your email'));

    // The invitation was opened before the account existed; it is accepted now (AUTH-07).
    await expect(page).toHaveURL(/\/onboarding\/about-you$/);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled();
    await page.getByLabel('Your postcode').fill('LS6 3QS');
    await page.getByLabel('Which gearbox?').selectOption('manual');
    await page.getByLabel('How far along are you?').selectOption('none');
    await page.getByLabel('Date of birth').fill('2006-04-12');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/app\/learner$/);

    expect(await learnerInstructorName(email)).toBe('Sarah Khan');

    // One use only: the same link opened again says so.
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible();
  });

  test('a learner who already has an account accepts in one tap', async ({ page, browser }, testInfo) => {
    const link = await inviteLink(browser, { fullName: 'Jack Taylor', email: 'jack.taylor@example.com' });

    const context = await browser.newContext({ storageState: authFile('learner') });
    const learnerPage = await context.newPage();
    await learnerPage.goto(link);
    await expect(learnerPage.getByRole('button', { name: 'Yes, Sarah Khan is my instructor' })).toBeVisible();
    await expectAccessible(learnerPage);
    await snap(learnerPage, testInfo, 'invite-accept');

    await learnerPage.getByRole('button', { name: 'Yes, Sarah Khan is my instructor' }).click();
    await expect(learnerPage).toHaveURL(/\/app\/learner$/);
    await context.close();

    // Signed out, the used link is spent.
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible();
  });

  test('a link nobody made says so', async ({ page }) => {
    await page.goto('/invite/not-a-real-token');
    await expect(page.getByRole('heading', { level: 1, name: 'This link does not work' })).toBeVisible();
  });
});
