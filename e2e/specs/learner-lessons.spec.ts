import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, clearDiary, removeLesson } from '../support/database';
import { dayLabel, expectAccessible, snap, tapUntil } from '../support/helpers';

/** What a learner opens the app for: their own lessons, and the two things they may do to one. */
test.describe('my lessons (BOK-08, BOK-09, M2-26)', () => {
  test.use({ storageState: authFile('learner') });

  /** A local day, however the machine running the tests is set (the browser is London). */
  const londonDay = (inDays: number): string => {
    const day = new Date();
    day.setDate(day.getDate() + inDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
  };

  /**
   * A Monday of its own for each width: past the fortnight the seed fills, and well inside the
   * eight weeks a learner may book ahead (R-04). Mondays belong to this spec: see the table in
   * support/database.ts.
   */
  const ownDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (4 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 1) day.setDate(day.getDate() + 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
  };

  test('shows what is booked and what has happened', async ({ page }, testInfo) => {
    await page.goto('/app/learner/lessons');
    await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();

    const coming = page.getByRole('region', { name: 'Coming up' });
    await expect(coming.getByRole('article').first()).toContainText('with Sarah Khan');
    await expect(coming.getByRole('article').first().getByRole('button', { name: 'Move' })).toBeVisible();

    // What has already happened is there too, and cannot be moved or called off.
    const before = page.getByRole('region', { name: 'Before now' });
    await expect(before.getByRole('article').first()).toBeVisible();
    await expect(before.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    await expectAccessible(page);
    await snap(page, testInfo, 'learner-lessons');
  });

  test('moves one to a time that suits better', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', day, '10:00');

    await page.goto('/app/learner/lessons');
    const coming = page.getByRole('region', { name: 'Coming up' });
    const lesson = coming.getByRole('article').filter({ hasText: dayLabel(day) });
    await expect(lesson).toContainText('10:00');

    await tapUntil(
      lesson.getByRole('button', { name: 'Move' }),
      page.getByRole('dialog', { name: 'Move this lesson' }),
    );
    const times = page.getByRole('group', { name: /^Times on/ });
    await expect(times).toBeVisible();
    // Half an hour later is free: the lesson being moved is not in its own way (BOK-08).
    await expect(times.getByRole('button', { name: '10:30' })).toBeVisible();
    await times.getByRole('button', { name: '14:00' }).click();
    await snap(page, testInfo, 'learner-move', { fullPage: false });

    await page.getByRole('button', { name: 'Move to 14:00' }).click();
    await expect(page.getByText(/^Moved to /)).toBeVisible();
    await expect(coming.getByRole('article').filter({ hasText: dayLabel(day) })).toContainText('14:00');
  });

  test('says what a late cancellation costs before it happens', async ({ page }, testInfo) => {
    // Tomorrow evening, which is always inside the free cancellation window of 48 hours (R-06).
    // An evening of its own for each width, because both widths run at once.
    const day = londonDay(1);
    const time = testInfo.project.name === 'mobile' ? '17:00' : '19:30';
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', day, time);

    await page.goto('/app/learner/lessons');
    const coming = page.getByRole('region', { name: 'Coming up' });
    const lesson = coming.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${time}` });
    await expect(lesson).toBeVisible();

    await tapUntil(
      lesson.getByRole('button', { name: 'Cancel' }),
      page.getByRole('dialog', { name: 'Cancel this lesson?' }),
    );
    await expect(page.getByText('This is a late cancellation, so £42 is charged.')).toBeVisible();
    await snap(page, testInfo, 'learner-cancel', { fullPage: false });

    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByText('Lesson cancelled')).toBeVisible();
    await expect(coming.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${time}` })).toHaveCount(0);

    // Out of the way again: this one sits in the days the seed fills, where other tests look.
    await removeLesson('Sarah Khan', 'jack.taylor@example.com', day, time);
  });
});
