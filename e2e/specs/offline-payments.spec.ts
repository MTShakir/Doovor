import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { bookLesson, clearDiary, offlinePaymentOn } from '../support/database';
import { dayLabel, expectAccessible, settled, snap } from '../support/helpers';

/**
 * Cash and bank transfers, recorded in two taps (PAY-05, M3-15).
 *
 * Saturdays in Sarah Khan's diary belong to this file, a week of its own for each width.
 */
test.describe('lessons paid in person (PAY-05, M3-15)', () => {
  test.use({ storageState: authFile('instructor') });

  const saturday = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (3 + (project === 'mobile' ? 0 : 1)));
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
  });
});
