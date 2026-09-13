import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { clearDiary, requestLesson } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/** A lesson somebody asked for, and the two answers to it (BOK-06, R-12, M2-18). */
test.describe('answering a request (BOK-06, M2-18)', () => {
  test.use({ storageState: authFile('instructor') });

  /** A Thursday of its own for each width, past the fortnight the seed fills. */
  const askOn = (project: string, nth: number): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (9 + nth + (project === 'mobile' ? 0 : 2)));
    while (day.getDay() !== 4) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  test('accepts one, and the diary says it is on', async ({ page }, testInfo) => {
    const day = askOn(testInfo.project.name, 0);
    await clearDiary('Sarah Khan', day);
    await requestLesson('Sarah Khan', 'jack.taylor@example.com', day, '10:00');

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article').filter({ hasText: 'Jack Taylor' });
    await expect(lesson).toContainText('Pending');
    await expectAccessible(page);
    await snap(page, testInfo, 'booking-request');

    await lesson.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Lesson with Jack Taylor confirmed')).toBeVisible();
    await expect(lesson).toContainText('Unpaid', { timeout: 30_000 });
    await expect(lesson.getByRole('button', { name: 'Accept' })).toBeHidden();
  });

  test('declines one with a word about why @desktop-only', async ({ page }, testInfo) => {
    const day = askOn(testInfo.project.name, 1);
    await clearDiary('Sarah Khan', day);
    await requestLesson('Sarah Khan', 'olivia.brown@example.com', day, '14:00');

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article').filter({ hasText: 'Olivia Brown' });
    await expect(lesson).toContainText('Pending');

    await tapUntil(
      lesson.getByRole('button', { name: 'Decline' }),
      page.getByRole('dialog', { name: /^Decline Olivia Brown/ }),
    );
    await page.getByLabel('Why, in a word or two?').fill('Away that afternoon');
    await snap(page, testInfo, 'booking-decline', { fullPage: false });
    await page.getByRole('button', { name: 'Decline the lesson' }).click();

    await expect(page.getByText('Lesson with Olivia Brown declined')).toBeVisible();
    await expect(lesson).toContainText('Cancelled', { timeout: 30_000 });
  });
});
