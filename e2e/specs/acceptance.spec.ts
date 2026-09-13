import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, clearDiary, lessonsOn } from '../support/database';
import { snap, tapUntil } from '../support/helpers';

/**
 * The acceptance tests from PRD 17.2 that this milestone owns, as somebody using the app
 * would see them. Two of them are also proved at the database level in pgTAP, where the
 * exact refusal can be read; these are the same rules seen through the screens.
 */
test.describe('acceptance tests (PRD 17.2)', () => {
  test.use({ storageState: authFile('instructor') });

  /**
   * A Friday of its own for each width, past the fortnight the seed fills. Fridays belong to
   * this spec: see the table in support/database.ts.
   */
  const ownFriday = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (12 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 5) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  /**
   * The next time the clocks go forward: the last Sunday in March, at one in the morning UTC.
   * Worked out rather than written down, so this test still means something next year.
   */
  const nextSpringForward = (): Date => {
    const now = new Date();
    for (let year = now.getUTCFullYear(); year < now.getUTCFullYear() + 5; year += 1) {
      const last = new Date(Date.UTC(year, 2, 31, 1, 0, 0));
      last.setUTCDate(last.getUTCDate() - last.getUTCDay());
      if (last.getTime() > now.getTime()) return last;
    }
    throw new Error('The clocks apparently never change again.');
  };

  const day = (date: Date): string => date.toISOString().slice(0, 10);

  test('acceptance-01: the half hour after a lesson belongs to the travel', async ({ page }, testInfo) => {
    const on = ownFriday(testInfo.project.name);
    await clearDiary('Sarah Khan', on);
    // Ten to eleven, with thirty minutes of travel after it (D-001, R-01).
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', on, '10:00');

    await page.goto(`/app/instructor/diary?view=day&date=${on}`);
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByRole('dialog', { name: 'Book a lesson' });
    // The sheet opens on the day the diary is showing. Waiting for that is waiting for the
    // page to be interactive, which is what everything after this depends on (D-043).
    await expect(sheet.getByLabel('Which day?')).toHaveValue(on);
    await sheet.getByLabel('Who is it for?').selectOption({ label: 'Olivia Brown' });

    // Eleven is inside the travel time, so it is not offered. Half past is.
    await expect(sheet.getByRole('button', { name: '11:00' })).toBeHidden();
    await expect(sheet.getByRole('button', { name: '11:15' })).toBeHidden();
    await expect(sheet.getByRole('button', { name: '11:30' })).toBeVisible();
    await snap(page, testInfo, 'acceptance-01', { fullPage: false });

    await sheet.getByRole('button', { name: '11:30' }).click();
    await sheet.getByRole('button', { name: /^Book 11:30 for £/ }).click();

    await expect(
      page.getByRole('article').filter({ hasText: 'Olivia Brown' }).filter({ hasText: '11:30' }),
    ).toBeVisible();
  });

  test('acceptance-09: a weekly lesson keeps its time when the clocks go forward', async ({ page }, testInfo) => {
    const sunday = nextSpringForward();
    // The Wednesdays either side of the change.
    const before = new Date(sunday);
    before.setUTCDate(before.getUTCDate() - 4);
    const after = new Date(before);
    after.setUTCDate(after.getUTCDate() + 7);

    // Each width books its own weeks, because both run at once.
    const hour = testInfo.project.name === 'mobile' ? '09:00' : '15:00';
    for (const date of [day(before), day(after)]) await clearDiary('Sarah Khan', date);

    await page.goto(`/app/instructor/diary?view=day&date=${day(before)}`);
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByRole('dialog', { name: 'Book a lesson' });
    await expect(sheet.getByLabel('Which day?')).toHaveValue(day(before));
    await sheet.getByLabel('Who is it for?').selectOption({ label: 'Jack Taylor' });
    await sheet.getByLabel('How often?').selectOption('4');
    await sheet.getByRole('button', { name: hour }).click();
    await sheet.getByRole('button', { name: new RegExp(`^Book ${hour} for £`) }).click();

    await expect(page.getByText(`4 lessons booked, ${hour} every week`)).toBeVisible();

    // The week after the clocks changed, the lesson is at the same time on the clock.
    await page.goto(`/app/instructor/diary?view=day&date=${day(after)}`);
    await expect(
      page.getByRole('article').filter({ hasText: 'Jack Taylor' }).filter({ hasText: hour }),
    ).toBeVisible();
    await snap(page, testInfo, 'acceptance-09');

    // And the instant moved by an hour, which is what keeping the local time means (R-14).
    const [first, second] = await Promise.all([
      lessonsOn('Sarah Khan', day(before)),
      lessonsOn('Sarah Khan', day(after)),
    ]);
    const week = 7 * 24 * 3_600_000;
    const apart = new Date(second[0]?.startsAt ?? 0).getTime() - new Date(first[0]?.startsAt ?? 0).getTime();
    expect(apart, 'a week minus the hour the clocks took').toBe(week - 3_600_000);
  });
});
