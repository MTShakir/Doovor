import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, clearDiary, removeLesson } from '../support/database';
import { dayLabel, expectAccessible, snap, tapUntil } from '../support/helpers';

/** What a learner opens the app for: their own lessons, cancelling one, and asking to move one. */
test.describe('my lessons (BOK-08, BOK-09, M2-26)', () => {
  test.use({ storageState: authFile('learner') });

  /** A local day, however the machine running the tests is set (the browser is London). */
  const londonDay = (inDays: number): string => {
    const day = new Date();
    day.setDate(day.getDate() + inDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
  };

  /**
   * A Monday of its own for each width and test, `weeks` or more ahead: past the fortnight the seed
   * fills, and inside the eight weeks a learner may book ahead (R-04). Mondays belong to this spec:
   * see the table in support/database.ts.
   */
  const ownDay = (project: string, weeks = 4): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (weeks + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 1) day.setDate(day.getDate() + 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
  };

  test('shows what is booked and what has happened', async ({ page }, testInfo) => {
    await page.goto('/app/learner/lessons');
    await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();

    const coming = page.getByRole('tabpanel', { name: 'Coming up' });
    await expect(coming.getByRole('article').first()).toContainText('with Sarah Khan');
    await expect(coming.getByRole('article').first().getByRole('button', { name: 'Move' })).toBeVisible();

    // What has already happened is there too, and cannot be moved or called off.
    const before = page.getByRole('region', { name: 'Before now' });
    await expect(before.getByRole('article').first()).toBeVisible();
    await expect(before.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    await expectAccessible(page);
    await snap(page, testInfo, 'learner-lessons');
  });

  test('asks their instructor to move one, since only the instructor can (D-164)', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', day, '10:00');

    await page.goto('/app/learner/lessons');
    const coming = page.getByRole('tabpanel', { name: 'Coming up' });
    const lesson = coming.getByRole('article').filter({ hasText: dayLabel(day) });
    await expect(lesson).toContainText('10:00');

    const notice = page.getByRole('dialog', { name: 'Only your instructor can move it' });
    await tapUntil(lesson.getByRole('button', { name: 'Move' }), notice);
    await expect(notice).toContainText('Contact Sarah Khan directly to ask for another time.');
    // No times to choose from: nothing a learner does here moves the lesson.
    await expect(page.getByRole('group', { name: /^Times on/ })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-move');

    await notice.getByRole('button', { name: 'Got it' }).click();
    await expect(notice).toBeHidden();
    await expect(coming.getByRole('article').filter({ hasText: dayLabel(day) })).toContainText('10:00');
    await removeLesson('Sarah Khan', 'jack.taylor@example.com', day, '10:00');
  });

  test('says what a late cancellation costs before it happens', async ({ page }, testInfo) => {
    // Tomorrow evening, which is always inside the free cancellation window of 48 hours (R-06).
    // An evening of its own for each width, because both widths run at once.
    const day = londonDay(1);
    const time = testInfo.project.name === 'mobile' ? '17:00' : '19:30';
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', day, time);

    await page.goto('/app/learner/lessons');
    const coming = page.getByRole('tabpanel', { name: 'Coming up' });
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

  test('finds a lesson on the month calendar, and cancels it there as from the list (D-170)', async ({ page }, testInfo) => {
    const day = ownDay(testInfo.project.name, 6);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', 'jack.taylor@example.com', day, '11:00');
    const noon = new Date(`${day}T12:00:00Z`);

    await page.goto('/app/learner/lessons');
    const calendar = page.getByRole('tabpanel', { name: 'Calendar' });
    await tapUntil(page.getByRole('tab', { name: 'Calendar' }), calendar);

    // It opens on the next lesson, which is sooner, so it is turned on to the lesson's month.
    const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(noon);
    const heading = calendar.getByRole('heading', { level: 2 });
    await expect(async () => {
      if ((await heading.textContent()) !== month) await calendar.getByRole('button', { name: 'Next month' }).click();
      await expect(heading).toHaveText(month, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });

    const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(noon);
    const dayButton = calendar.getByRole('button', { name: date, exact: true });
    await dayButton.click();
    await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
    await expect(calendar.getByRole('heading', { level: 3, name: dayLabel(day) })).toBeVisible();
    const lesson = calendar.getByRole('article').filter({ hasText: `${dayLabel(day)} at 11:00` });
    await expect(lesson).toContainText('with Sarah Khan');
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-calendar');

    // Its row is the list's own, so it is cancelled from here the same way, and the day is empty.
    await tapUntil(lesson.getByRole('button', { name: 'Cancel' }), page.getByRole('dialog', { name: 'Cancel this lesson?' }));
    await page.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(page.getByText('Lesson cancelled')).toBeVisible();
    await expect(calendar.getByText('Nothing booked on this day.')).toBeVisible();
    await expect(lesson).toHaveCount(0);
    await removeLesson('Sarah Khan', 'jack.taylor@example.com', day, '11:00');
  });
});
