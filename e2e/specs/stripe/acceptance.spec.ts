import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { authFile, roles } from '../../support/accounts';
import {
  bookAsLearner,
  bookLesson,
  cardPaymentRefFor,
  clearDiary,
  clearNotifications,
  clearPaymentsAccount,
  countProviderEvents,
  creditFromPayment,
  creditWith,
  enablePayments,
  lessonIdAt,
  lessonMoney,
  newestPaymentFor,
  notificationDelivery,
  packagePaymentRef,
  requestLesson,
} from '../../support/database';
import { chooseDate, dayLabel, settled, snap, tapThrough, tapUntil } from '../../support/helpers';
import { signInThroughForm } from '../../support/sign-in';
import { jobRunnerIsUp, payInCardForm, stripeAccountId, stripeGet, stripeSignature } from '../../support/stripe';

/**
 * The money acceptance tests against Stripe test mode (PRD 17.2 tests 3 to 6 and 12, M3-23), and the
 * authorisation M3-08 has to show there.
 *
 * The journeys in payments.spec.ts and self-booking.spec.ts, with Stripe where those have the
 * fake: a test card typed into the card form (D-099), Stripe's events reaching the app through
 * `pnpm stripe:listen`, and the jobs run by the job runner (`pnpm dev:jobs`), since /dev/events
 * is closed with Stripe. Run with `pnpm test:e2e:stripe`, set up as RUNBOOK 3.7a says.
 *
 * One test at a time: they share the school's account, and each waits on Stripe and the runner.
 */
test.describe.configure({ mode: 'serial' });

const owner = roles.schoolOwner.email;
const school = 'Quayside Driving School';

/** Stripe to the listener to the app: usually a few seconds. */
const WEBHOOK = 60_000;
/** The runner sends waiting events each minute, and notifications each minute after that. */
const JOBS = 240_000;

interface StripeList<T> {
  data: T[];
}
interface StripePaymentIntent {
  id: string;
  status: string;
  amount: number;
}
interface StripeRefund {
  id: string;
  status: string;
  amount: number;
}
interface StripeEvent {
  id: string;
  type: string;
  account?: string;
  data: { object: { id: string } };
}

/** Tomorrow in London: always inside the default policy's 48 hours. */
const tomorrow = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + 24 * 3_600_000));

/** A weekday some weeks out, past the fortnight the seed fills. */
const weeksOut = (weeks: number, weekday: number): string => {
  const day = new Date();
  day.setDate(day.getDate() + 7 * weeks);
  while (day.getDay() !== weekday) day.setDate(day.getDate() + 1);
  return day.toISOString().slice(0, 10);
};

let account = '';

test.beforeAll(async () => {
  account = stripeAccountId();
  const connected = await stripeGet<{ charges_enabled: boolean }>(`accounts/${account}`);
  expect(connected.charges_enabled, 'the test account can take cards: finish onboarding with pnpm stripe:test-account').toBe(true);
  expect(await jobRunnerIsUp(), 'the job runner is running: pnpm dev:jobs').toBe(true);
  await enablePayments(owner, account);
});

test.afterAll(async () => {
  await clearPaymentsAccount(owner);
});

/** Pays for a lesson from the learner's own list with a test card, and waits for Stripe to say so. */
async function payForLesson(page: Page, testInfo: TestInfo, instructor: string, day: string, hour: string, bookingId: string): Promise<void> {
  await page.goto('/app/learner/lessons');
  const lesson = page.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${hour}` }).filter({ hasText: instructor });
  await tapThrough(lesson.getByRole('link', { name: /^Pay £/ }), /\/app\/learner\/pay\//);

  const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
  await expect(async () => {
    await checkout.getByRole('button', { name: /^Pay £/ }).click();
    await expect(checkout.getByRole('form', { name: 'Card details' })).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 40_000 });
  await expect(checkout.getByRole('form', { name: 'Card details' }).getByRole('button', { name: /^Pay £/ })).toBeEnabled({ timeout: 30_000 });
  await settled(page);
  await snap(page, testInfo, 'stripe-card-form');

  await payInCardForm(page, /^Pay £/);
  await expect(checkout).toContainText('Payment taken.');
  await expect
    .poll(async () => (await lessonMoney(bookingId)).paymentStatus, {
      timeout: WEBHOOK,
      message: 'Stripe told the app the lesson was paid: is pnpm stripe:listen running?',
    })
    .toBe('paid_card');
  await page.goto(`/app/learner/pay/${bookingId}`);
  await expect(page.getByRole('region', { name: /at \d\d:\d\d$/ })).toContainText('That is paid for, and your lesson is confirmed.');
}

/** Buys a package from the learner's Payments screen with a test card. */
async function buyPackage(page: Page, name: string, price: string): Promise<void> {
  await page.goto('/app/learner/payments');
  const credit = page.getByRole('region', { name: `Balance with ${school}` });
  await tapThrough(credit.getByRole('link', { name: new RegExp(`^Buy ${name}`) }), /\/app\/learner\/payments\/packages\//);

  const purchase = page.getByRole('region', { name });
  await purchase.getByRole('checkbox', { name: /^Start my lessons straight away/ }).click();
  await purchase.getByRole('button', { name: `Pay ${price} for ${name}` }).click();
  await payInCardForm(page, `Pay ${price}`);
  await expect(page.getByText('Payment taken. Your credit shows in a few seconds.')).toBeVisible();
}

/** The learner's notification about one lesson, found by when the lesson was. */
const cancelledNotice = (page: Page, day: string, hour: string) =>
  page.getByRole('article').filter({ hasText: 'Lesson cancelled' }).filter({ hasText: `${dayLabel(day)} at ${hour}` });

test('acceptance-04 with Stripe: a card lesson cancelled a day before keeps the whole fee, and the learner is emailed why', async ({ browser }, testInfo) => {
  test.setTimeout(480_000);
  const learner = roles.payer.email;
  const day = tomorrow();
  const hour = '06:30';
  await clearNotifications(learner);
  await bookLesson('Tom Walsh', learner, day, hour);
  const bookingId = await lessonIdAt('Tom Walsh', day, hour);

  const context = await browser.newContext({ storageState: authFile('payer') });
  const page = await context.newPage();
  await payForLesson(page, testInfo, 'Tom Walsh', day, hour, bookingId);
  const intent = await cardPaymentRefFor(bookingId);
  expect(await stripeGet<StripePaymentIntent>(`payment_intents/${intent}`, account), 'Stripe took £42 on the school account').toMatchObject({
    status: 'succeeded',
    amount: 4200,
  });

  await page.goto('/app/learner/lessons');
  const lesson = page.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${hour}` }).filter({ hasText: 'Tom Walsh' });
  const sheet = page.getByRole('dialog', { name: 'Cancel this lesson?' });
  await expect(async () => {
    await lesson.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20_000 });
  await expect(sheet).toContainText('This is a late cancellation, so the £42 you paid is kept as the fee.');
  await sheet.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Lesson cancelled')).toBeVisible();

  // The full fee is kept: the payment stands, here and at Stripe, and nothing goes back.
  expect(await lessonMoney(bookingId)).toEqual({
    paymentStatus: 'paid_card',
    payments: [{ method: 'card', status: 'paid', amountPence: 4200, refundedPence: 0 }],
    refunds: [],
  });
  expect((await stripeGet<StripeList<StripeRefund>>(`refunds?payment_intent=${intent}`, account)).data).toEqual([]);

  // The runner tells the learner why, by email as well as in the app.
  await expect
    .poll(async () => notificationDelivery(learner, 'booking.cancelled', bookingId), {
      timeout: JOBS,
      message: 'the job runner wrote and sent the notice: is pnpm dev:jobs running?',
    })
    .toMatchObject({ sent: true });
  expect((await notificationDelivery(learner, 'booking.cancelled', bookingId))?.channels).toContain('email');
  await page.goto('/notifications');
  await expect(cancelledNotice(page, day, hour)).toContainText(
    'Cancelling less than 48 hours before a lesson costs the full price, so the £42 you paid is kept as the fee.',
  );
  await context.close();
});

test('acceptance-05 with Stripe: the instructor cancels a paid lesson, and the card is refunded in full without anybody asking', async ({ browser }, testInfo) => {
  test.setTimeout(480_000);
  const learner = { email: 'amelia.evans@example.com', name: 'Amelia Evans' };
  const day = tomorrow();
  const hour = '21:30';
  await clearNotifications(learner.email);
  await bookLesson('Emma Clarke', learner.email, day, hour);
  const bookingId = await lessonIdAt('Emma Clarke', day, hour);

  const learnerContext = await browser.newContext();
  const page = await learnerContext.newPage();
  await signInThroughForm(page, learner.email, { next: '/app/learner/lessons' });
  await payForLesson(page, testInfo, 'Emma Clarke', day, hour, bookingId);
  const intent = await cardPaymentRefFor(bookingId);

  // Emma Clarke calls it off from her diary, a day before, and says why (R-08).
  const instructor = await browser.newContext({ storageState: authFile('schoolInstructor') });
  const diary = await instructor.newPage();
  await diary.goto(`/app/instructor/diary?view=day&date=${day}`);
  const lesson = diary.getByRole('article', { name: `${hour} ${learner.name}` });
  const sheet = diary.getByRole('dialog', { name: `Cancel ${learner.name}?` });
  await expect(async () => {
    await lesson.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20_000 });
  await expect(sheet).toContainText('Because you are, they are charged nothing. The £42 they paid goes back to their card.');
  await sheet.getByLabel('Why?').fill('Car in for repair');
  await sheet.getByRole('button', { name: 'Cancel the lesson' }).click();
  await expect(diary.getByText(`Lesson with ${learner.name} cancelled`)).toBeVisible();
  await instructor.close();

  // All of it is on its way back, and nobody asked for it: the runner sends it to Stripe, and
  // Stripe's refund events settle it.
  expect((await lessonMoney(bookingId)).refunds).toEqual([{ kind: 'card', status: 'pending', amountPence: 4200 }]);
  await expect
    .poll(async () => lessonMoney(bookingId), { timeout: JOBS, message: 'the refund went to Stripe and came back settled: is pnpm dev:jobs running?' })
    .toEqual({
      paymentStatus: 'refunded',
      payments: [{ method: 'card', status: 'refunded', amountPence: 4200, refundedPence: 4200 }],
      refunds: [{ kind: 'card', status: 'succeeded', amountPence: 4200 }],
    });
  const refunds = await stripeGet<StripeList<StripeRefund>>(`refunds?payment_intent=${intent}`, account);
  expect(refunds.data.map((one) => [one.amount, one.status]), 'Stripe refunded the card once, in full').toEqual([[4200, 'succeeded']]);

  await expect
    .poll(async () => notificationDelivery(learner.email, 'booking.cancelled', bookingId), { timeout: JOBS })
    .toMatchObject({ sent: true });
  await page.goto('/notifications');
  await expect(cancelledNotice(page, day, hour)).toContainText('Reason: Car in for repair. £42 is going back to your card.');
  await learnerContext.close();
});

test('acceptance-12 with Stripe: a learner books from a shared link and pays by card on a phone in under a minute', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const email = 'amelia.evans@example.com';
  const day = weeksOut(6, 2);
  await clearDiary('Emma Clarke', day);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signInThroughForm(page, email);

  const started = Date.now();
  await page.goto('/book/emma-clarke');
  await expect(page.getByRole('group', { name: /^Times on/ }).or(page.getByText(/^Nothing free on/))).toBeVisible();
  await chooseDate(page.getByLabel('Which day?'), day);
  const times = page.getByRole('group', { name: /^Times on/ });
  await expect(times).toBeVisible();
  await times.getByRole('button', { name: '11:00' }).click();
  await page.getByRole('button', { name: /^Book 11:00 for £\d+$/ }).click();
  await expect(page.getByRole('heading', { name: /^Lesson (booked|requested)$/ })).toBeVisible();

  await page.getByRole('link', { name: 'Pay for it now' }).click();
  const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
  await checkout.getByRole('button', { name: /^(Pay|Authorise) £/ }).click();
  await payInCardForm(page, /^(Pay|Authorise) £/);
  await expect(checkout.getByRole('status')).toContainText(/^(Payment taken|Card authorised)\./);
  // acceptance-12: from opening the link to a paid lesson, on a phone, in under a minute.
  expect(Date.now() - started).toBeLessThan(60_000);

  const bookingId = await lessonIdAt('Emma Clarke', day, '11:00');
  await expect.poll(async () => (await lessonMoney(bookingId)).payments.length, { timeout: WEBHOOK }).toBe(1);
  await settled(page);
  await snap(page, testInfo, 'stripe-booked-and-paid');
  await context.close();
});

test('acceptance-03 with Stripe: credit bought by card pays for a lesson, and all of it comes back when it is cancelled in time', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const email = 'isla.roberts@example.com';
  const day = weeksOut(5, 3);
  const before = await creditWith(email, owner);

  const context = await browser.newContext();
  const page = await context.newPage();
  await signInThroughForm(page, email, { next: '/app/learner/payments' });
  await buyPackage(page, '5 hours', '£195');
  await expect
    .poll(async () => (await creditWith(email, owner)).minutes, { timeout: WEBHOOK, message: 'Stripe told the app the package was paid for' })
    .toBe(before.minutes + 300);
  const bought = before.minutes + 300;
  const intent = await packagePaymentRef(email, owner);
  expect(await stripeGet<StripePaymentIntent>(`payment_intents/${String(intent)}`, account)).toMatchObject({ status: 'succeeded', amount: 19500 });

  // Booked the way the app books: create_booking takes the hour from credit (PAY-04).
  await bookAsLearner(email, 'Emma Clarke', day, '11:00');
  expect((await creditWith(email, owner)).minutes, 'the lesson took an hour of credit').toBe(bought - 60);

  await page.goto('/app/learner/lessons');
  const lesson = page.getByRole('article').filter({ hasText: `${dayLabel(day)} at 11:00` }).filter({ hasNotText: 'Cancelled' });
  await expect(lesson.getByText('Credit', { exact: true })).toBeVisible();
  const sheet = page.getByRole('dialog', { name: 'Cancel this lesson?' });
  await expect(async () => {
    await lesson.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20_000 });
  await expect(sheet).toContainText('No charge: the credit it used comes back to you.');
  await sheet.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Lesson cancelled')).toBeVisible();
  expect((await creditWith(email, owner)).minutes, 'every minute came back').toBe(bought);

  await page.goto('/app/learner/payments');
  await expect(page.getByRole('region', { name: `Balance with ${school}` })).toBeVisible();
  await settled(page);
  await snap(page, testInfo, 'stripe-credit-returned');
  await context.close();
});

test('acceptance-06 with Stripe: the event for a card payment delivered three times is one payment and one credit entry', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const email = roles.payer.email;
  const before = await creditWith(email, owner);

  const context = await browser.newContext({ storageState: authFile('payer') });
  const page = await context.newPage();
  await buyPackage(page, '5 hours', '£195');
  // The first delivery is Stripe's own, through the listener.
  await expect.poll(async () => (await creditWith(email, owner)).minutes, { timeout: WEBHOOK }).toBe(before.minutes + 300);
  await context.close();

  const intent = await packagePaymentRef(email, owner);
  const events = await stripeGet<StripeList<StripeEvent>>('events?type=payment_intent.succeeded&limit=25', account);
  const event = events.data.find((one) => one.data.object.id === intent);
  if (!event) throw new Error(`Stripe has no payment_intent.succeeded event for ${String(intent)}`);

  // The same event twice more, signed as Stripe signs it, as Stripe sends it when it is not sure
  // the first one arrived.
  const body = JSON.stringify({ ...event, account });
  const deliveries = await Promise.all(
    [1, 2].map(() =>
      request.post('/api/webhooks/stripe', { data: body, headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature(body) } }),
    ),
  );
  for (const delivery of deliveries) expect(delivery.status(), 'every delivery is answered 200').toBe(200);
  const outcomes = await Promise.all(deliveries.map((one) => one.json() as Promise<{ outcome: string }>));
  expect(outcomes.map((one) => one.outcome), 'the first delivery did the work').toEqual(['duplicate', 'duplicate']);

  expect(await countProviderEvents(event.id), 'the event is recorded once').toBe(1);
  expect(await creditFromPayment(String(intent)), 'one payment and one credit entry').toEqual({ payments: 1, lots: 1, purchases: 1 });
  expect((await creditWith(email, owner)).minutes).toBe(before.minutes + 300);
});

test('a request authorises the card at Stripe, which is taken when it is accepted and released when it is declined (M3-08)', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const learner = { email: 'amelia.evans@example.com', name: 'Amelia Evans' };
  const day = weeksOut(8, 4);
  await clearDiary('Emma Clarke', day);
  await requestLesson('Emma Clarke', learner.email, day, '10:00');
  await requestLesson('Emma Clarke', learner.email, day, '15:00');
  const toAccept = await lessonIdAt('Emma Clarke', day, '10:00');
  const toDecline = await lessonIdAt('Emma Clarke', day, '15:00');

  const learnerContext = await browser.newContext();
  const page = await learnerContext.newPage();
  await signInThroughForm(page, learner.email, { next: '/app/learner/lessons' });

  /** Authorises a request with a test card, and waits for Stripe to say the money is set aside. */
  const authorise = async (hour: string, bookingId: string): Promise<string> => {
    await page.goto('/app/learner/lessons');
    const lesson = page.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${hour}` }).filter({ hasText: 'Emma Clarke' });
    await tapThrough(lesson.getByRole('link', { name: /^Authorise £/ }), new RegExp(`/app/learner/pay/${bookingId}`));
    const checkout = page.getByRole('region', { name: /at \d\d:\d\d$/ });
    await expect(checkout).toContainText('Your card is only charged if they do.');
    await expect(async () => {
      await checkout.getByRole('button', { name: /^Authorise £/ }).click();
      await expect(checkout.getByRole('form', { name: 'Card details' })).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 40_000 });
    await payInCardForm(page, /^Authorise £/);
    await expect(checkout).toContainText('Card authorised.');
    await expect
      .poll(async () => (await newestPaymentFor(bookingId))?.status, { timeout: WEBHOOK, message: 'Stripe told the app the card is authorised' })
      .toBe('authorised');
    const intent = (await newestPaymentFor(bookingId))?.providerRef ?? '';
    expect(await stripeGet<StripePaymentIntent>(`payment_intents/${intent}`, account), 'held at Stripe, not taken').toMatchObject({
      status: 'requires_capture',
      amount: 4200,
    });
    return intent;
  };

  const accepted = await authorise('10:00', toAccept);
  const declined = await authorise('15:00', toDecline);
  await settled(page);
  await snap(page, testInfo, 'stripe-request-authorised');

  // Emma Clarke answers both from her diary.
  const instructor = await browser.newContext({ storageState: authFile('schoolInstructor') });
  const diary = await instructor.newPage();
  await diary.goto(`/app/instructor/diary?view=day&date=${day}`);
  const morning = diary.getByRole('article', { name: `10:00 ${learner.name}` });
  await expect(morning).toContainText('Pending');
  await morning.getByRole('button', { name: 'Accept' }).click();
  await expect(diary.getByText(`Lesson with ${learner.name} confirmed`)).toBeVisible();

  const afternoon = diary.getByRole('article', { name: `15:00 ${learner.name}` });
  await tapUntil(afternoon.getByRole('button', { name: 'Decline' }), diary.getByRole('dialog', { name: new RegExp(`^Decline ${learner.name}`) }));
  await diary.getByLabel('Why, in a word or two?').fill('Away that afternoon');
  await diary.getByRole('button', { name: 'Decline the lesson' }).click();
  await expect(diary.getByText(`Lesson with ${learner.name} declined`)).toBeVisible();
  await instructor.close();

  // The runner takes the accepted one and lets the declined one go, and Stripe says so.
  await expect
    .poll(async () => (await newestPaymentFor(toAccept))?.status, { timeout: JOBS, message: 'the accepted request was charged: is pnpm dev:jobs running?' })
    .toBe('paid');
  expect(await stripeGet<StripePaymentIntent>(`payment_intents/${accepted}`, account), 'taken at Stripe').toMatchObject({ status: 'succeeded' });
  await expect
    .poll(async () => (await newestPaymentFor(toDecline))?.status, { timeout: JOBS, message: 'the declined request was let go' })
    .toBe('cancelled');
  expect(await stripeGet<StripePaymentIntent>(`payment_intents/${declined}`, account), 'released at Stripe').toMatchObject({ status: 'canceled' });

  await page.goto(`/app/learner/pay/${toDecline}`);
  await expect(page.getByRole('region', { name: /at \d\d:\d\d$/ })).toContainText('Nothing has been taken from your card.');
  await learnerContext.close();
});
