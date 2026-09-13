import { expect, test, type TestInfo } from '@playwright/test';
import { totp } from '../../packages/db/src/testing/totp';
import { seedAccounts } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { testNumber } from '../support/phone-numbers';
import { enterCode, signInThroughForm } from '../support/sign-in';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/** Different seeded people per viewport so parallel projects never share state. */
function perProject<T>(testInfo: TestInfo, mobile: T, desktop: T): T {
  return testInfo.project.name === 'mobile' ? mobile : desktop;
}

test.describe('sign-up (AUTH-01, AUTH-03)', () => {
  test('the first screen asks what brings you here', async ({ page }, testInfo) => {
    await page.goto('/start');
    await expect(page.getByRole('heading', { level: 1, name: 'Get started' })).toBeVisible();
    for (const card of ["I'm learning to drive", "I'm an instructor", 'I run a driving school']) {
      await expect(page.getByText(card)).toBeVisible();
    }
    await expectAccessible(page);
    await snap(page, testInfo, 'start');
  });

  test('a learner signs up, answers the questions and lands on Home', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'learner');
    await chooseRoleAndCreateAccount(page, { card: "I'm learning to drive", heading: 'Create your learner account' }, { fullName: 'Ella Learner', email });
    await snap(page, testInfo, 'check-email');
    await page.goto(await linkFromEmail(email, 'Confirm your email'));

    // A learner is asked their five questions before their own portal opens (AUTH-06).
    await expect(page).toHaveURL(/\/onboarding\/about-you$/);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled();
    await page.getByLabel('Your name').fill('Ella Learner');
    await page.getByLabel('Your postcode').fill('LS6 3QS');
    await page.getByLabel('Which gearbox?').selectOption('automatic');
    await page.getByLabel('How far along are you?').selectOption('some');
    await page.getByLabel('Date of birth').fill('2006-11-20');
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page).toHaveURL(/\/app\/learner$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  });

  test('an instructor signs up, verifies their mobile by text and lands on Today (AUTH-02)', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'instructor');
    await chooseRoleAndCreateAccount(page, { card: "I'm an instructor", heading: 'Create your instructor account' }, { fullName: 'Ian Newcomer', email });
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    // Mobile verification comes first, then onboarding: no detour through a diary they cannot use yet.
    await expect(page).toHaveURL(/\/verify-phone\?next=%2Fonboarding/);
    await expect(page.getByRole('heading', { name: 'Verify your mobile' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'verify-phone');
    // Ofcom drama numbers with a fixed local test code (D-033).
    await page.getByLabel('Mobile number').fill(testNumber(testInfo, 'verify-mobile'));
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await enterCode(page, '123456');
    await expect(page).toHaveURL(/\/onboarding\/name$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What should learners call you?' })).toBeVisible();
  });

  test('a school owner signs up and must turn on two-step verification (AUTH-08)', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'school');
    await chooseRoleAndCreateAccount(
      page,
      { card: 'I run a driving school', heading: 'Create your school account' },
      { fullName: 'Sophie Owner', email, schoolName: `Test School ${testInfo.project.name}` },
    );
    await page.goto(await linkFromEmail(email, 'Confirm your email'));
    await expect(page).toHaveURL(/\/mfa\?next=%2Fapp%2Fschool/);
    await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
    await snap(page, testInfo, 'mfa-setup', { fullPage: false });
    const secret = (await page.locator('.font-mono').innerText()).replace(/\s/g, '');
    await enterCode(page, totp(secret));
    await expect(page).toHaveURL(/\/app\/school$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  });

  test('on a slow connection, early typing is kept and nothing is sent before the page is ready', async ({ page }, testInfo) => {
    // Hold back the JavaScript so the page stays as server HTML, as on a slow connection.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js'),
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await page.goto('/sign-up?role=learner', { waitUntil: 'domcontentloaded' });

    const email = uniqueEmail(testInfo, 'early');
    const password = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: 'Create account' });
    await page.getByLabel('Full name').fill('Early Typist');
    await page.getByLabel('Email').fill(email);
    await password.fill('a long pass phrase');

    // Nothing leaves the browser: the button waits for the page, and the form would post anyway.
    await expect(submit).toBeDisabled();
    await expect(page.locator('form', { has: password })).toHaveAttribute('method', 'post');
    const sent = page
      .waitForRequest((request) => request.method() === 'POST' || request.url().includes('phrase'), { timeout: 2_000 })
      .then(
        () => true,
        () => false,
      );
    await password.press('Enter');
    expect(await sent).toBe(false);

    // Once the page is ready, what was typed is still there and the form works.
    release();
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel('Full name')).toHaveValue('Early Typist');
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(password).toHaveValue('a long pass phrase');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  });

  test('says what to fix when the form is incomplete', async ({ page }) => {
    await page.goto('/sign-up?role=learner');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('Enter an email address like name@example.com')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters')).toBeVisible();
  });
});

test.describe('sign-in (AUTH-01)', () => {
  test('a wrong password says so without revealing whether the account exists', async ({ page }, testInfo) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('jack.taylor@example.com');
    await page.getByLabel('Password', { exact: true }).fill('not the password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Email or password is not right.')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'sign-in-error');
  });

  test('a learner signs in with a magic link', async ({ page }, testInfo) => {
    const email = perProject(testInfo, 'isla.roberts@example.com', 'amelia.evans@example.com');
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Email me a sign-in link instead' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Email me a link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.goto(await linkFromEmail(email, 'Your sign-in link'));
    await expect(page).toHaveURL(/\/app\/learner$/);
  });

  test('an instructor signs in with a text message code', async ({ page }, testInfo) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Use a text message code instead' }).click();
    await page.getByLabel('Mobile number').fill(testNumber(testInfo, 'sign-in-with-code'));
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await enterCode(page, '123456');
    await expect(page).toHaveURL(/\/app\/instructor$/);
  });

  test('a forgotten password can be reset by email', async ({ page }, testInfo) => {
    const email = perProject(testInfo, 'leo.johnson@example.com', 'mia.walker@example.com');
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    // Next keeps the sign-in page mounted but hidden after a client navigation, with its own
    // Email field. Role queries skip hidden elements; label queries do not.
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.goto(await linkFromEmail(email, 'Reset your password'));
    await expect(page).toHaveURL(/\/account\/password$/);
    await page.getByLabel('New password').fill('a brand new phrase');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/app\/learner$/);

    // The old password no longer works; the new one does.
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(seedAccounts().password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Email or password is not right.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('a brand new phrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/learner$/);
  });

  // The admin portal is desktop only (PRD 8.2).
  test('seeded staff pass the TOTP challenge on every sign-in (AUTH-08)', { tag: '@desktop-only' }, async ({ page }) => {
    await signInThroughForm(page, 'support@example.com');
    await expect(page).toHaveURL(/\/admin$/);
  });
});
