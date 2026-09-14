import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import {
  acceptRequests,
  bookLesson,
  clearPaymentsAccount,
  creditFromPayment,
  creditWith,
  enablePayments,
  expireHoldsNow,
  finishedLessonOwed,
  holdPaymentsBusiness,
  lessonsOn,
  packagePurchaseParts,
  paymentFor,
  paymentsAccountOf,
  removeLesson,
  removeLessonById,
  requestLesson,
  setBookingStatus,
} from '../support/database';
import { dayLabel, expectAccessible, settled, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';
import { fakeSignature } from '../support/webhooks';

/**
 * Everything about one Business taking money (PAY-01, PAY-02, PAY-03, R-10, M3-02, M3-05).
 *
 * One file, one at a time: every test here changes whether the school can take cards, and two
 * of them running at once would each see the other's half-finished state. They are quick.
 */
test.describe.configure({ mode: 'serial' });

// The two widths run this file at the same time, and both switch the same school's payments on
// and off. They take turns instead, for as long as the file takes.
let letGo: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  test.setTimeout(10 * 60_000);
  letGo = await holdPaymentsBusiness();
});

test.afterAll(async () => {
  await letGo?.();
});

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

    // Once cards can be taken, the owner chooses when learners are asked for one (PAY-03, M3-09).
    const how = page.getByRole('region', { name: 'How learners pay' });
    const choice = how.getByLabel('Learners pay');
    await expect(choice).toHaveValue('at_booking');
    await expect(how).toContainText('The slot is held while they pay');
    await expectAccessible(page);

    await expect(choice.locator('option')).toHaveText(['When they book', 'The day before the lesson', 'After the lesson', 'In person']);
    await choice.selectOption('offline');
    await expect(page.getByText('Learners now pay in person')).toBeVisible();
    await expect(how).toContainText('Learners are not asked for a card.');
    await expect(choice).toBeEnabled();
    await snap(page, testInfo, 'payments-mode');
    await page.reload();
    await expect(page.getByRole('region', { name: 'How learners pay' }).getByLabel('Learners pay')).toHaveValue('offline');

    await page.getByRole('region', { name: 'How learners pay' }).getByLabel('Learners pay').selectOption('at_booking');
    await expect(page.getByText('Learners now pay when they book')).toBeVisible();

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

    // By time, not by position: other tests in this file book the same day.
    const held = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === hour);
    expect(held?.status, 'the slot is held while they pay').toBe('pending_payment');

    await checkout.getByRole('button', { name: 'Pay with a test card' }).click();
    // Anything that went wrong says so here, which is what a person would read.
    // Whatever happened says so: the toast when it worked, an alert when it did not.
    await expect(page.getByText('Lesson paid for').or(checkout.getByRole('alert'))).toBeVisible();
    await expect(checkout.getByRole('alert')).toHaveCount(0);
    await expect(checkout).toContainText('That is paid for, and your lesson is confirmed.', { timeout: 30_000 });
    await snap(page, testInfo, 'pay-lesson-done');

    // The webhook did the work: the lesson is on, and the payment is written down.
    const after = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === hour);
    expect(after?.status).toBe('confirmed');
    expect(await paymentFor(after?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'paid' });

    await clearPaymentsAccount(owner);
  });

  test('a card kept on the first lesson pays for the second in one press (M3-07)', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const day = ownDay(testInfo.project.name);
    // An account of its own each run, so a card kept last time is not already there.
    await enablePayments(owner, `fake_acct_saved_${testInfo.project.name}_${String(Date.now())}`);
    await bookLesson('Tom Walsh', learner, day, '08:00');
    await bookLesson('Tom Walsh', learner, day, '12:00');

    const openPayment = async (hour: string) => {
      await page.goto('/app/learner/lessons');
      const lesson = page
        .getByRole('article')
        .filter({ hasText: `at ${hour}` })
        .filter({ hasText: 'Tom Walsh' });
      await expect(async () => {
        await lesson.getByRole('link', { name: /^Pay £/ }).click();
        await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
      }).toPass({ timeout: 20_000 });
      return page.getByRole('region', { name: /at \d\d:\d\d$/ });
    };

    // The first lesson: a card typed in, and kept because the learner said so (D-079).
    const first = await openPayment('08:00');
    const keep = first.getByRole('checkbox', { name: /Save this card for next time/ });
    await expect(keep).not.toBeChecked();
    await expect(first.getByRole('button', { name: /with Visa/ })).toHaveCount(0);
    await keep.click();
    await expect(keep).toBeChecked();
    await snap(page, testInfo, 'pay-keep-card');

    await expect(async () => {
      await first.getByRole('button', { name: /^Pay £/ }).click();
      await expect(first.getByRole('button', { name: 'Pay with a test card' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });
    await first.getByRole('button', { name: 'Pay with a test card' }).click();
    await expect(first).toContainText('That is paid for, and your lesson is confirmed.', { timeout: 30_000 });

    // The second lesson offers the card, and one press pays for it.
    const second = await openPayment('12:00');
    await expect(second).toContainText('Visa ending 4242, expires 12/30');
    const payWithKept = second.getByRole('button', { name: 'Pay £42 with Visa ending 4242' });
    await expect(payWithKept).toBeVisible();
    await expect(second.getByRole('button', { name: 'Use a different card' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'pay-saved-card');

    await expect(async () => {
      await payWithKept.click();
      await expect(second).toContainText('That is paid for, and your lesson is confirmed.', { timeout: 10_000 });
    }).toPass({ timeout: 40_000 });
    await snap(page, testInfo, 'pay-saved-card-done');

    const paid = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === '12:00');
    expect(paid?.status, 'the webhook confirmed the second lesson').toBe('confirmed');
    expect(await paymentFor(paid?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'paid' });

    // The card is listed where cards are managed, and removing it can be undone.
    await page.goto('/app/learner/payments');
    const school = page.getByRole('region', { name: 'Quayside Driving School' });
    const row = school.locator('li').filter({ hasText: 'Visa ending 4242' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Expires 12/30');
    await expectAccessible(page);
    await snap(page, testInfo, 'payments-cards');

    await row.getByRole('button', { name: 'Remove Visa ending 4242' }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row).toHaveCount(1);

    // Left alone, it goes when the five seconds are up, and stays gone.
    await row.getByRole('button', { name: 'Remove Visa ending 4242' }).click();
    await expect(row).toHaveCount(0);
    await page.waitForTimeout(6000);
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'No saved cards' })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 30_000 });
    await snap(page, testInfo, 'payments-no-cards');

    await clearPaymentsAccount(owner);
  });

  test('a request authorises the card, which is taken on accept and let go on decline (M3-08)', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const day = ownDay(testInfo.project.name);
    await enablePayments(owner, `fake_acct_request_${testInfo.project.name}_${String(Date.now())}`);
    const ask = async (hour: string) => {
      await removeLesson('Tom Walsh', learner, day, hour);
      await requestLesson('Tom Walsh', learner, day, hour);
    };

    /** The job runner is not part of this run: the sweep it would run in five minutes runs now. */
    const settle = async () => {
      const answer = await page.request.post('/dev/authorisations');
      expect(answer.ok()).toBe(true);
      return (await answer.json()) as { captured: number; released: number; failed: number };
    };

    const authorise = async (hour: string) => {
      await page.goto('/app/learner/lessons');
      const lesson = page
        .getByRole('article')
        .filter({ hasText: `at ${hour}` })
        .filter({ hasText: 'Tom Walsh' });
      await expect(async () => {
        await lesson.getByRole('link', { name: /^Authorise £/ }).click();
        await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
      }).toPass({ timeout: 20_000 });

      const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
      await expect(checkout).toContainText('Request');
      await expect(checkout).toContainText('Your card is only charged if they do.');
      await expect(async () => {
        await checkout.getByRole('button', { name: /^Authorise £/ }).click();
        await expect(checkout.getByRole('button', { name: 'Authorise with a test card' })).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 40_000 });
      await checkout.getByRole('button', { name: 'Authorise with a test card' }).click();
      await expect(checkout).toContainText('Your card is authorised for £42.', { timeout: 30_000 });
      return checkout;
    };

    // Asking: the card is set aside, and nothing is taken.
    await ask('20:00');
    const accepted = await authorise('20:00');
    await expect(accepted).toContainText('You are only charged if Tom Walsh accepts');
    await expectAccessible(page);
    await snap(page, testInfo, 'pay-request-authorised');

    const asked = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === '20:00');
    expect(await paymentFor(asked?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'authorised' });

    // Accepted: the money is taken.
    await acceptRequests('Tom Walsh', day);
    expect((await settle()).captured, 'the sweep took the authorised card').toBeGreaterThan(0);
    await page.reload();
    await expect(accepted).toContainText('That is paid for, and your lesson is confirmed.');
    expect(await paymentFor(asked?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'paid' });

    // Declined: the money is let go of, and the learner is told nothing was taken. Asked only
    // now, because accepting above accepts every request that day.
    await ask('06:00');
    const declined = await authorise('06:00');
    const other = (await lessonsOn('Tom Walsh', day)).find((one) => one.time === '06:00');
    await setBookingStatus('Tom Walsh', other?.startsAt ?? '', 'cancelled');
    expect((await settle()).released, 'the sweep released the authorised card').toBeGreaterThan(0);
    await page.reload();
    await expect(declined).toContainText('This lesson is not going ahead. Nothing has been taken from your card.');
    await snap(page, testInfo, 'pay-request-declined');
    expect(await paymentFor(other?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'cancelled' });

    await clearPaymentsAccount(owner);
  });

  test('a lesson charged the day before asks only for a card, and is charged or told why not (M3-09)', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const day = ownDay(testInfo.project.name);
    // A fortnight on, where nothing else in this file books.
    const later = new Date(`${day}T12:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 14);
    const laterDay = later.toISOString().slice(0, 10);

    await enablePayments(owner, `fake_acct_before_${testInfo.project.name}_${String(Date.now())}`);
    // The last hour of the day nobody else in this file books, buffer and all.
    await bookLesson('Tom Walsh', learner, day, '21:30', { paymentMode: 'before_lesson' });
    await bookLesson('Tom Walsh', learner, laterDay, '21:30', { paymentMode: 'before_lesson' });

    /** The job runner is not part of this run, and nobody waits a day: the charge runs now, up to a lesson. */
    const chargeUpTo = async (onDay: string) => {
      const lesson = (await lessonsOn('Tom Walsh', onDay)).find((one) => one.time === '21:30');
      const hours = Math.ceil((Date.parse(lesson?.startsAt ?? '') - Date.now()) / 3_600_000) + 1;
      const answer = await page.request.post(`/dev/charges?within=${String(hours)}`);
      expect(answer.ok()).toBe(true);
      return { lesson, result: (await answer.json()) as { charged: number; failed: number } };
    };

    const openPayment = async (onDay: string) => {
      await page.goto('/app/learner/lessons');
      const lesson = page
        .getByRole('article')
        // By the day as well: the other width books the same hour on days of its own.
        .filter({ hasText: `${dayLabel(onDay)} at 21:30` })
        .filter({ hasText: 'Tom Walsh' });
      await expect(async () => {
        await lesson.getByRole('link', { name: /^Set up payment$|^Pay £/ }).click();
        await page.waitForURL(/\/app\/learner\/pay\//, { timeout: 5000 });
      }).toPass({ timeout: 20_000 });
      return page.getByRole('region', { name: /at \d\d:\d\d$/ });
    };

    // Nothing to pay now, only a card to have ready.
    const first = await openPayment(day);
    await expect(first).toContainText('Booked');
    await expect(first).toContainText('Save a card and £42 is charged to it at 21:30 on');
    await expect(first).toContainText('Nothing is taken until then.');
    await expect(first.getByRole('button', { name: /^Pay £/ })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'pay-before-lesson');

    // No card by the day before: the lesson stays on, and the learner is asked to pay.
    const unpaid = await chargeUpTo(day);
    expect(unpaid.result.failed, 'the lesson with no card was written down as failed').toBeGreaterThan(0);
    await page.reload();
    await expect(first).toContainText('This lesson could not be charged the day before. Pay now to keep it.');
    await expect(first).toContainText('To pay');
    await expect(first.getByRole('button', { name: /^Pay £/ })).toBeVisible();
    await snap(page, testInfo, 'pay-before-lesson-failed');

    // A card saved in time is charged the day before, and the webhook says so.
    const second = await openPayment(laterDay);
    await expect(async () => {
      await second.getByRole('button', { name: 'Save a card' }).click();
      await expect(second.getByRole('button', { name: 'Save a test card' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });
    await second.getByRole('button', { name: 'Save a test card' }).click();

    await expect(second).toContainText('£42 is charged to your Visa ending 4242 at 21:30 on', { timeout: 30_000 });
    await expect(second.getByRole('button', { name: 'Use a different card' })).toBeVisible();
    // The button has just gone from black to grey, and a picture half way through is neither.
    await settled(page);
    await snap(page, testInfo, 'pay-before-lesson-card');

    const booked = (await lessonsOn('Tom Walsh', laterDay)).find((one) => one.time === '21:30');
    expect(await paymentFor(booked?.startsAt ?? ''), 'nothing is taken until the day before').toBeNull();

    const paid = await chargeUpTo(laterDay);
    expect(paid.result.charged, 'the lesson with a card was charged').toBeGreaterThan(0);
    await page.reload();
    await expect(second).toContainText('That is paid for, and your lesson is confirmed.');
    expect(await paymentFor(booked?.startsAt ?? '')).toEqual({ amountPence: 4200, status: 'paid' });

    await clearPaymentsAccount(owner);
  });

  test('a lesson paid for afterwards is paid for from the lessons list once it is done (M3-10)', async ({ page }, testInfo) => {
    await enablePayments(owner, `fake_acct_after_${testInfo.project.name}_${String(Date.now())}`);
    // Days of their own in the past, a few weeks apart for each width, so neither sees the other's.
    const daysAgo = testInfo.project.name === 'mobile' ? 40 : 47;
    const id = await finishedLessonOwed('Tom Walsh', learner, daysAgo, '11:00');

    try {
      await page.goto('/app/learner/lessons');
      const lesson = page.locator(`article:has(a[href="/app/learner/pay/${id}"])`);
      await expect(lesson).toContainText('Tom Walsh');
      await expectAccessible(page);

      await expect(async () => {
        await lesson.getByRole('link', { name: 'Pay £42' }).click();
        await page.waitForURL(new RegExp(`/app/learner/pay/${id}`), { timeout: 5000 });
      }).toPass({ timeout: 20_000 });

      const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
      await expect(checkout).toContainText('To pay');
      await expect(checkout.getByRole('button', { name: /^Pay £42$/ })).toBeVisible();
      await snap(page, testInfo, 'pay-after-lesson');

      await expect(async () => {
        await checkout.getByRole('button', { name: /^Pay £42$/ }).click();
        await expect(checkout.getByRole('button', { name: 'Pay with a test card' })).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 40_000 });
      await checkout.getByRole('button', { name: 'Pay with a test card' }).click();
      await expect(checkout).toContainText('That is paid for. Thank you.', { timeout: 30_000 });

      await page.goto('/app/learner/lessons');
      await expect(page.locator(`a[href="/app/learner/pay/${id}"]`)).toHaveCount(0);
    } finally {
      // A finished lesson in the past would sit on this learner's history for every later run.
      await removeLessonById(id);
      await clearPaymentsAccount(owner);
    }
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
    await expect(checkout).toContainText('This slot is no longer held for you, so the lesson is not booked.');
    await expect(checkout).toContainText('Nothing has been taken from your card.');
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

test.describe('buying a package (PAY-04, M3-13)', () => {
  const owner = roles.schoolOwner.email;
  const school = 'Quayside Driving School';

  /**
   * Learners of the school's that none of the lesson payments above belong to, one for each
   * width. Lessons are paid from credit first, so credit would change how their lessons are paid.
   */
  const buyer = (project: string): string =>
    project === 'mobile' ? 'isla.roberts@example.com' : 'amelia.evans@example.com';

  test('a learner buys a package, and has the hours as credit', async ({ page }, testInfo) => {
    const email = buyer(testInfo.project.name);
    await enablePayments(owner, `fake_acct_packages_${testInfo.project.name}`);
    const before = await creditWith(email, owner);

    await signInThroughForm(page, email, { next: '/app/learner/payments' });
    const credit = page.getByRole('region', { name: `Credit with ${school}` });
    await expect(credit).toBeVisible();
    await expect(credit.getByRole('link', { name: /^Buy 10 hours/ })).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'lesson-credit');

    await expect(async () => {
      await credit.getByRole('link', { name: /^Buy 5 hours/ }).click();
      await page.waitForURL(/\/app\/learner\/payments\/packages\//, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    const purchase = page.getByRole('region', { name: '5 hours' });
    await expect(purchase).toContainText('£195');
    await expect(purchase).toContainText('£39 an hour');
    await expect(purchase).toContainText(`It is for lessons with ${school} only.`);
    await expect(purchase).toContainText('Use them within a year of buying.');

    // Nothing is asked of the card until the learner has said their lessons may start (D-086).
    const pay = purchase.getByRole('button', { name: 'Pay £195 for 5 hours' });
    const unticked = purchase.getByText('Tick "Start my lessons straight away" to buy this package.');
    await expect(async () => {
      await pay.click();
      await expect(unticked).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'package-purchase');

    await purchase.getByRole('checkbox', { name: /^Start my lessons straight away/ }).click();
    await expect(unticked).toBeHidden();
    await pay.click();
    await purchase.getByRole('button', { name: 'Pay with a test card' }).click();

    await page.waitForURL(/\/app\/learner\/payments$/);
    await expect(page.getByText('5 hours of credit added')).toBeVisible();
    await expect(page.getByRole('region', { name: `Credit with ${school}` })).toContainText(
      `${String((before.minutes + 300) / 60)} hours of credit`,
    );
    expect(await creditWith(email, owner)).toEqual({ minutes: before.minutes + 300, lots: before.lots + 1 });
    await settled(page);
    await snap(page, testInfo, 'credit-added');

    await clearPaymentsAccount(owner);
  });

  test('acceptance-06: a payment delivered three times is one payment and one credit entry @desktop-only', async ({ request }, testInfo) => {
    const account = await enablePayments(owner, `fake_acct_acceptance06_${String(Date.now())}`);
    const parts = await packagePurchaseParts(owner, '10 hours', buyer(testInfo.project.name));
    const intent = `pi_acceptance06_${String(Date.now())}`;

    const body = JSON.stringify({
      id: `evt_${intent}`,
      type: 'payment_intent.succeeded',
      account,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: intent,
          amount: parts.pricePence,
          amount_received: parts.pricePence,
          metadata: {
            package_id: parts.packageId,
            business_id: parts.businessId,
            learner_id: parts.learnerId,
            minutes: String(parts.minutes),
            expiry_days: '365',
            starts_now: 'yes',
          },
        },
      },
    });
    const headers = { 'content-type': 'application/json', 'stripe-signature': fakeSignature(body) };

    const deliveries = await Promise.all(
      [1, 2, 3].map(() => request.post('/api/webhooks/stripe', { data: body, headers })),
    );
    for (const delivery of deliveries) expect(delivery.status(), 'every delivery is answered 200').toBe(200);

    const outcomes = await Promise.all(deliveries.map((one) => one.json() as Promise<{ outcome: string }>));
    expect(outcomes.map((one) => one.outcome).sort(), 'one of them did the work').toEqual([
      'credit_added',
      'duplicate',
      'duplicate',
    ]);
    expect(await creditFromPayment(intent), 'and it made one payment and one credit entry').toEqual({
      payments: 1,
      lots: 1,
      purchases: 1,
    });

    await clearPaymentsAccount(owner);
  });
});
