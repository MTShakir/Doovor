import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import {
  bookLesson,
  clearPaymentsAccount,
  enablePayments,
  expireHoldsNow,
  lessonsOn,
  paymentFor,
  paymentsAccountOf,
} from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * Everything about one Business taking money (PAY-01, PAY-02, PAY-03, R-10, M3-02, M3-05).
 *
 * One file, one at a time: every test here changes whether the school can take cards, and two
 * of them running at once would each see the other's half-finished state. They are quick.
 */
test.describe.configure({ mode: 'serial' });

test.describe('connecting payments (PAY-01, M3-02)', () => {
  test('an owner sets it up, finishes, and comes back able to take cards', async ({ browser }, testInfo) => {
    // The school's owner, whose Business nothing else asserts about: connecting payments
    // changes what the instructor's own checklist says about theirs.
    const email = roles.schoolOwner.email;
    await clearPaymentsAccount(email);

    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    await page.goto('/app/school/money');

    const card = page.getByRole('region', { name: 'Card payments' });
    await expect(card).toContainText('Set this up once');
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'payments-off');

    // Off to the provider, which sends them back when they have finished. The button does
    // nothing until the page is interactive, so the proof it worked is where it lands (D-043).
    await expect(async () => {
      await card.getByRole('button', { name: 'Set up payments' }).click();
      await page.waitForURL(/connected=1/, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card).toContainText('You can take card, Apple Pay and Google Pay.');
    await snap(page, testInfo, 'payments-on');

    expect(await paymentsAccountOf(email), 'the account is written down against the Business').toMatch(/^fake_acct_/);

    // Left as it was found, so nothing else has to know this test ran.
    await clearPaymentsAccount(email);
    await context.close();
  });

  test('somebody who does not own the business is told so @desktop-only', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('schoolManager') });
    const page = await context.newPage();
    await page.goto('/app/school/money');

    const card = page.getByRole('region', { name: 'Card payments' });
    await expect(card).toContainText('Only the owner of the business can set payments up.');
    await expect(card.getByRole('button', { name: /Set up payments|Finish setting up/ })).toBeHidden();
    await context.close();
  });
});

test.describe('paying for a lesson (PAY-02, M3-05)', () => {
  test.use({ storageState: authFile('payer') });

  const owner = roles.schoolOwner.email;
  // A learner the school already has, so nothing else's list changes when they book.
  const learner = roles.payer.email;

  /** A Thursday of its own for each width: Thursdays belong to the request specs, so this
   * takes one far past them, where nothing else books. */
  const ownDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (30 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 4) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  test('a learner pays, and the lesson says so', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name);
    const hour = testInfo.project.name === 'mobile' ? '10:00' : '14:00';
    await enablePayments(owner, `fake_acct_test_${testInfo.project.name}`);
    await bookLesson('Tom Walsh', learner, day, hour);

    await page.goto('/app/learner/lessons');
    const lesson = page
      .getByRole('article')
      .filter({ hasText: `at ${hour}` })
      .filter({ hasText: 'Tom Walsh' });
    await expect(lesson).toBeVisible();

    // An unpaid lesson with a Business that can take cards offers to be paid for.
    await expect(async () => {
      await lesson.getByRole('link', { name: /^Pay £/ }).click();
      await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
    await expect(checkout).toContainText('To pay');
    await expect(checkout).toContainText('£42');
    await expectAccessible(page);
    await snap(page, testInfo, 'pay-lesson');

    // Starting the payment holds the slot while a card is found (R-10).
    await expect(async () => {
      await checkout.getByRole('button', { name: /^Pay £/ }).click();
      await expect(checkout.getByRole('button', { name: 'Pay with a test card' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });

    const [held] = await lessonsOn('Tom Walsh', day);
    expect(held?.status, 'the slot is held while they pay').toBe('pending_payment');

    await checkout.getByRole('button', { name: 'Pay with a test card' }).click();
    // Anything that went wrong says so here, which is what a person would read.
    // Whatever happened says so: the toast when it worked, an alert when it did not.
    await expect(page.getByText('Lesson paid for').or(checkout.getByRole('alert'))).toBeVisible();
    await expect(checkout.getByRole('alert')).toHaveCount(0);
    await expect(checkout).toContainText('That is paid for, and your lesson is confirmed.', { timeout: 30_000 });
    await snap(page, testInfo, 'pay-lesson-done');

    // The webhook did the work: the lesson is on, and the payment is written down.
    const [after] = await lessonsOn('Tom Walsh', day);
    expect(after?.status).toBe('confirmed');
    expect(await paymentFor(after?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'paid' });

    await clearPaymentsAccount(owner);
  });

  test('a hold that runs out gives the slot back, and the page says so @desktop-only', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name);
    await enablePayments(owner, `fake_acct_expiry_${testInfo.project.name}`);
    await bookLesson('Tom Walsh', learner, day, '18:00');

    await page.goto('/app/learner/lessons');
    const lesson = page
      .getByRole('article')
      .filter({ hasText: 'at 18:00' })
      .filter({ hasText: 'Tom Walsh' });
    await expect(async () => {
      await lesson.getByRole('link', { name: /^Pay £/ }).click();
      await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
    await expect(async () => {
      await checkout.getByRole('button', { name: /^Pay £/ }).click();
      await expect(checkout.getByRole('button', { name: 'Pay with a test card' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });
    await expect(checkout).toContainText('This slot is held for you until');

    // The clock a hold runs on is the only thing the sweep looks at (R-10).
    expect(await expireHoldsNow('Tom Walsh', day), 'the sweep gave a slot back').toBeGreaterThan(0);

    await page.reload();
    await expect(checkout).toContainText('Slot gone');
    await expect(checkout).toContainText('The slot was held while you paid, and the hold has run out.');
    await expect(checkout.getByRole('button', { name: /^Pay £/ })).toBeHidden();
    await expectAccessible(page);
    await snap(page, testInfo, 'pay-lesson-expired');

    // By name, not by position: the earlier test in this file booked the same day.
    const after = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === '18:00');
    expect(after?.status, 'the time is back in the diary').toBe('expired');

    await clearPaymentsAccount(owner);
  });

  test('a refused card leaves the lesson unpaid and says so @desktop-only', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name);
    await enablePayments(owner, `fake_acct_refused_${testInfo.project.name}`);
    await bookLesson('Tom Walsh', learner, day, '16:00');

    await page.goto('/app/learner/lessons');
    const lesson = page
      .getByRole('article')
      .filter({ hasText: 'at 16:00' })
      .filter({ hasText: 'Tom Walsh' });
    await expect(async () => {
      await lesson.getByRole('link', { name: /^Pay £/ }).click();
      await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
    await expect(async () => {
      await checkout.getByRole('button', { name: /^Pay £/ }).click();
      await expect(checkout.getByRole('button', { name: 'Test a refused card' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });

    await checkout.getByRole('button', { name: 'Test a refused card' }).click();
    await expect(page.getByText('The card was refused. Try another one.')).toBeVisible();
    await expect(checkout).toContainText('To pay');

    await clearPaymentsAccount(owner);
  });
});
