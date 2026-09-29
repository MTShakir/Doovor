import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import {
  bookAsLearner,
  clearPaymentsAccount,
  giveCredit,
  holdPaymentsBusiness,
  makeSchoolLearner,
  withDatabase,
} from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * Credit pays for what it covers and the rest is paid the usual way (PAY-04, D-225).
 *
 * Credit used to be all or nothing, so an hour sitting against a two hour lesson bought nothing
 * and the learner was asked for the whole price. What is checked here is the money: that the
 * instructor is handed the remainder and not the price, and that the lesson says it was paid two
 * ways.
 *
 * A learner of its own, made for the test. The credit ledger keeps every lesson it paid for, so a
 * lesson bought with credit can never be cleared away again (see giveCredit in
 * support/database.ts): a seeded learner would carry this one around for the rest of the run, and
 * a balance another spec had topped up would cover the whole lesson and there would be no
 * remainder to pay. Nothing is removed at the end for the same reason.
 *
 * It takes the payments lock, because whether the school takes cards decides whether the rest is
 * paid in person, and that is one answer for the whole Business.
 */
test.describe.configure({ mode: 'serial' });

let letGo: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  test.setTimeout(10 * 60_000);
  letGo = await holdPaymentsBusiness();
});

test.afterAll(async () => {
  await letGo?.();
});

test.describe('credit pays for what it covers (PAY-04, D-225)', () => {
  test.use({ storageState: authFile('schoolInstructor') });

  /**
   * A Thursday four or five weeks out, one for each width. It is booked as the learner, so it has
   * to be inside the eight week horizon a learner may book within, and it is past the fortnight
   * the seed fills. A Thursday because Emma Clarke works nine to five on weekdays and a two hour
   * lesson on a Sunday is refused before any of this is reached, and because the payments file
   * takes her Wednesdays at 11:00 for its own credit test.
   */
  const workingDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + (project === 'mobile' ? 28 : 35));
    while (day.getDay() !== 4) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  test('an hour of credit against a two hour lesson leaves the rest to pay', async ({ page }, testInfo) => {
    const on = workingDay(testInfo.project.name);
    const at = '13:00';
    const learner = await makeSchoolLearner(`Cara Credit ${testInfo.project.name}`, {
      postcode: 'M1 2QF',
      transmission: 'manual',
      instructorName: 'Emma Clarke',
    });
    // A school that takes no cards, whatever another test left behind, so the rest is handed over
    // in person.
    await clearPaymentsAccount(roles.schoolOwner.email);
    // One hour of credit, bought for £40, against a two hour lesson.
    await giveCredit(learner.email, roles.schoolOwner.email, 60, 4000);
    expect(await creditMinutes(learner.email), 'the hour is there to spend').toBe(60);

    await bookAsLearner(learner.email, 'Emma Clarke', on, at, 120);

    // The hour is spent, whatever the lesson costs.
    expect(await creditMinutes(learner.email), 'the hour of credit went on the lesson').toBe(0);

    const lesson = await lessonMoney('Emma Clarke', learner.email, on, at);
    expect(lesson.creditMinutes, 'the lesson remembers the hour it took').toBe(60);
    expect(lesson.paymentStatus, 'and is not paid until the rest of it is').toBe('unpaid');
    // Half the lesson came from credit, so half the price is left, to the penny.
    expect(lesson.owedPence).toBe(lesson.pricePence - Math.floor(lesson.pricePence / 2));

    // The instructor is asked for the rest, not the price, and told where the rest of it went.
    await page.goto(`/app/instructor/diary?view=day&date=${on}`);
    const card = page.getByRole('article', { name: `${at} ${learner.name}` });
    await expect(card).toBeVisible();
    const sheet = page.getByRole('dialog', { name: `How did ${learner.name} pay?` });
    // The button does nothing until the page is interactive (D-043).
    await expect(async () => {
      await card.getByRole('button', { name: 'Mark paid' }).click();
      await expect(sheet).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await expect(sheet).toContainText(`${pounds(lesson.owedPence)} for`);
    await expect(sheet).toContainText('after 1 hour paid with credit');
    await expect(sheet, 'never the whole price').not.toContainText(`${pounds(lesson.pricePence)} for`);
    await expectAccessible(page);
    await snap(page, testInfo, 'part-credit-mark-paid');

    await sheet.getByRole('button', { name: 'Cash' }).click();
    await expect(page.getByText('Marked paid (cash)')).toBeVisible();

    // What was taken is the rest, and the lesson says it was paid two ways.
    const paid = await lessonMoney('Emma Clarke', learner.email, on, at);
    expect(paid.paidPence, 'the cash taken is the rest, not the price').toBe(lesson.owedPence);
    await expect(card.getByText('Paid (credit + cash)', { exact: true })).toBeVisible();
    await settled(page);
    await snap(page, testInfo, 'part-credit-paid');
  });
});

/** "£42.50", as the app writes it. */
function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2).replace(/\.00$/, '')}`;
}

async function creditMinutes(learnerEmail: string): Promise<number> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ minutes: number }[]>`
      select coalesce(sum(a.balance_minutes), 0)::int as minutes
        from public.credit_accounts a
        join public.users u on u.id = a.learner_id
       where lower(u.email) = lower(${learnerEmail})`;
    return row?.minutes ?? 0;
  });
}

async function lessonMoney(
  instructorName: string,
  learnerEmail: string,
  date: string,
  time: string,
): Promise<{ creditMinutes: number; paymentStatus: string; pricePence: number; owedPence: number; paidPence: number }> {
  return withDatabase(async (sql) => {
    const [row] = await sql<
      { credit_minutes: number; payment_status: string; price_pence: number; owed_pence: number; paid_pence: number }[]
    >`
      select b.credit_minutes, b.payment_status::text as payment_status, b.price_pence,
             private.booking_owed_pence(b) as owed_pence,
             coalesce((select sum(p.amount_pence) from public.payments p
                        where p.booking_id = b.id and p.status = 'paid'), 0)::int as paid_pence
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
        join public.users u on u.id = b.learner_id
       where i.display_name = ${instructorName}
         and lower(u.email) = lower(${learnerEmail})
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date
         and to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') = ${time}`;
    if (!row) throw new Error(`No lesson for ${learnerEmail} with ${instructorName} on ${date} at ${time}`);
    return {
      creditMinutes: row.credit_minutes,
      paymentStatus: row.payment_status,
      pricePence: row.price_pence,
      owedPence: row.owed_pence,
      paidPence: row.paid_pence,
    };
  });
}
