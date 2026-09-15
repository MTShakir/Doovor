import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { bookLesson, clearDiary, lateFeeOwed, lessonIdAt, lessonMoney, offlinePaymentOn, userIdOf } from '../support/database';
import { dayLabel, expectAccessible, settled, snap } from '../support/helpers';

/**
 * Cash and bank transfers, recorded in two taps (PAY-05, M3-15), and given back (M3-18).
 *
 * Saturdays in Sarah Khan's diary belong to this file, a week of its own for each width and each
 * test: the tests run at the same time, and all of them are about Jack Taylor's money.
 */
test.describe('lessons paid in person (PAY-05, M3-15)', () => {
  test.use({ storageState: authFile('instructor') });

  const saturday = (project: string, weeksLater = 0): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (3 + (project === 'mobile' ? 0 : 1) + weeksLater));
    while (day.getDay() !== 6) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  test('an instructor marks a lesson paid in cash in two taps, a slip is one undo away, and the learner sees it', async ({
    page,
    browser,
  }, testInfo) => {
    const day = saturday(testInfo.project.name);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', roles.learner.email, day, '10:00');

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article', { name: '10:00 Jack Taylor' });
    await expect(lesson.getByText('Unpaid', { exact: true })).toBeVisible();

    // Tap one. The button does nothing until the page is interactive (D-043).
    const sheet = page.getByRole('dialog', { name: 'How did Jack Taylor pay?' });
    await expect(async () => {
      await lesson.getByRole('button', { name: 'Mark paid' }).click();
      await expect(sheet).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await expect(sheet).toContainText('£42');
    await expectAccessible(page);
    await snap(page, testInfo, 'mark-paid');

    // Tap two, and a slip put right before the toast goes.
    await sheet.getByRole('button', { name: 'Cash' }).click();
    await expect(lesson.getByText('Paid (cash)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText("Jack Taylor's lesson is unpaid again")).toBeVisible();
    await expect(lesson.getByText('Unpaid', { exact: true })).toBeVisible();
    expect(await offlinePaymentOn('Sarah Khan', day, '10:00'), 'the payment came back out').toBeNull();

    // And for real.
    await lesson.getByRole('button', { name: 'Mark paid' }).click();
    await sheet.getByRole('button', { name: 'Cash' }).click();
    await expect(page.getByText('Marked paid (cash)')).toBeVisible();
    await expect(lesson.getByText('Paid (cash)', { exact: true })).toBeVisible();
    await expect(lesson.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
    expect(await offlinePaymentOn('Sarah Khan', day, '10:00')).toEqual({ method: 'cash', status: 'paid', amountPence: 4200 });
    await settled(page);
    await snap(page, testInfo, 'paid-cash');

    // The learner's own list says the same thing.
    const learner = await browser.newContext({ storageState: authFile('learner') });
    const theirs = await learner.newPage();
    await theirs.goto('/app/learner/lessons');
    const mine = theirs.getByRole('article').filter({ hasText: `${dayLabel(day)} at 10:00` });
    await expect(mine.getByText('Paid (cash)', { exact: true })).toBeVisible();
    await learner.close();

    // Sarah runs her own Business, so she can hand the money back, from the learner card (PAY-07, M3-17).
    await page.goto(`/app/instructor/learners/${await userIdOf(roles.learner.email)}`);
    const money = page.getByRole('region', { name: 'Money' });
    const entry = money.getByRole('list', { name: 'Recent payments and credit' }).getByRole('listitem').filter({ hasText: `Lesson on ${dayLabel(day)}` });
    const refund = page.getByRole('dialog', { name: 'Refund Jack Taylor' });
    await expect(async () => {
      await entry.getByRole('button', { name: 'Refund' }).click();
      await expect(refund).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await expect(refund.getByLabel('Amount')).toHaveValue('42.00');
    await expect(refund.getByLabel('How it goes back')).toHaveValue('payment');
    await expect(refund.getByRole('option', { name: 'Handed back in cash' })).toHaveCount(1);
    await expect(refund.getByRole('button', { name: 'Refund £42' })).toBeDisabled();
    await refund.getByLabel('Why').fill('The car broke down on the way');
    await expectAccessible(page);
    await snap(page, testInfo, 'refund-sheet');

    await refund.getByRole('button', { name: 'Refund £42' }).click();
    await expect(page.getByText('£42 refunded', { exact: true })).toBeVisible();
    await expect(entry).toContainText('Cash, refunded');
    await expect(entry.getByRole('button', { name: 'Refund' })).toHaveCount(0);
    await expect(money.getByRole('list', { name: 'Recent payments and credit' })).toContainText('Paid back');
    expect(await offlinePaymentOn('Sarah Khan', day, '10:00')).toEqual({ method: 'cash', status: 'refunded', amountPence: 4200 });
    await settled(page);
    await snap(page, testInfo, 'refunded');
  });

  test('cash for a lesson the instructor calls off is owed back until it is handed back, and a late fee is paid in person (R-06, R-08, M3-18)', async ({
    page,
    browser,
  }, testInfo) => {
    const day = saturday(testInfo.project.name, 2);
    await bookLesson('Sarah Khan', roles.learner.email, day, '12:00');

    // Paid in cash, then called off: nothing is charged, and the cash is owed back (R-08).
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article', { name: '12:00 Jack Taylor' });
    const paid = page.getByRole('dialog', { name: 'How did Jack Taylor pay?' });
    await expect(async () => {
      await lesson.getByRole('button', { name: 'Mark paid' }).click();
      await expect(paid).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await paid.getByRole('button', { name: 'Cash' }).click();
    await expect(lesson.getByText('Paid (cash)', { exact: true })).toBeVisible();

    const cancel = page.getByRole('dialog', { name: 'Cancel Jack Taylor?' });
    await lesson.getByRole('button', { name: 'Cancel' }).click();
    await expect(cancel).toContainText('The £42 they paid is owed back to them: mark it handed back on their learner card once it is.');
    await cancel.getByLabel('Why?').fill('Car off the road');
    await cancel.getByRole('button', { name: 'Cancel the lesson' }).click();
    await expect(page.getByText('Lesson with Jack Taylor cancelled')).toBeVisible();

    const bookingId = await lessonIdAt('Sarah Khan', day, '12:00');
    expect((await lessonMoney(bookingId)).refunds).toEqual([{ kind: 'offline', status: 'pending', amountPence: 4200 }]);

    // A fee for another lesson, called off late by the learner and not paid (R-06).
    const feeDay = dayLabel(day);
    await lateFeeOwed('Sarah Khan', roles.learner.email, day, '15:00', 2100);

    // The learner sees what is owed back to them: at least this, with the other width's at the same time.
    const learner = await browser.newContext({ storageState: authFile('learner') });
    const theirs = await learner.newPage();
    await theirs.goto('/app/learner/payments');
    const balance = theirs.getByRole('region', { name: 'Balance with Sarah Khan Driving' });
    await expect(balance.getByRole('list', { name: 'Balance' })).toContainText(/£\d+ owed back/);
    const theirFee = balance.getByRole('list', { name: 'Lessons owed for' }).getByRole('listitem').filter({ hasText: `${feeDay} at 15:00` });
    await expect(theirFee).toContainText('Late cancellation fee, with Sarah Khan');
    await expect(theirFee).toContainText('£21');
    await expectAccessible(theirs);
    await settled(theirs);
    await snap(theirs, testInfo, 'owed-back-learner');
    await learner.close();

    // Sarah marks the cash handed back, from the learner card, in two taps.
    await page.goto(`/app/instructor/learners/${await userIdOf(roles.learner.email)}`);
    const money = page.getByRole('region', { name: 'Money' });
    const owedBack = money.getByRole('list', { name: 'Owed back' }).getByRole('listitem').filter({ hasText: `For the lesson on ${feeDay}` });
    await expect(owedBack).toContainText('£42 owed back');
    // Nothing is left to refund on the payment: all of it is already owed back.
    const cashEntry = money.getByRole('list', { name: 'Recent payments and credit' }).getByRole('listitem').filter({ hasText: `Lesson on ${feeDay}` });
    await expect(cashEntry).toContainText('Cash');
    await expect(cashEntry.getByRole('button', { name: 'Refund' })).toHaveCount(0);
    const handBack = page.getByRole('dialog', { name: 'Hand back £42 to Jack Taylor?' });
    await expect(async () => {
      await owedBack.getByRole('button', { name: 'Mark handed back' }).click();
      await expect(handBack).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await expectAccessible(page);
    await snap(page, testInfo, 'hand-back');
    await handBack.getByRole('button', { name: 'It is handed back' }).click();
    await expect(page.getByText('£42 handed back to Jack Taylor')).toBeVisible();
    await expect(owedBack).toHaveCount(0);
    expect(await lessonMoney(bookingId)).toMatchObject({
      paymentStatus: 'refunded',
      payments: [{ method: 'cash', status: 'refunded', amountPence: 4200, refundedPence: 4200 }],
      refunds: [{ kind: 'offline', status: 'succeeded', amountPence: 4200 }],
    });

    // And the fee, paid in cash, is the fee and not the lesson (PAY-05).
    const fee = money.getByRole('list', { name: 'Lessons owed for' }).getByRole('listitem').filter({ hasText: `${feeDay} at 15:00` });
    await expect(fee).toContainText('Late cancellation fee');
    const feeSheet = page.getByRole('dialog', { name: 'How did Jack Taylor pay?' });
    await fee.getByRole('button', { name: 'Mark paid' }).click();
    await expect(feeSheet).toContainText(`£21 late cancellation fee for ${feeDay} at 15:00.`);
    await feeSheet.getByRole('button', { name: 'Cash' }).click();
    await expect(page.getByText('Marked paid (cash)')).toBeVisible();
    await expect(fee).toHaveCount(0);
    expect(await offlinePaymentOn('Sarah Khan', day, '15:00')).toEqual({ method: 'cash', status: 'paid', amountPence: 2100 });
    await settled(page);
    await snap(page, testInfo, 'fee-paid');
  });
});
