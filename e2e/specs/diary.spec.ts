import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { addDays, dayLabel, dayWords, expectAccessible, nextWeekday, snap } from '../support/helpers';

/**
 * The diary (DIA-03, DIA-04, M1-19). The seed fills the fortnight after the day it ran, and Sarah
 * Khan teaches on Tuesdays, so the tests work from the next Tuesday: a day with lessons on it that
 * is never today. Every date and label below is worked out from it.
 */
const tuesday = nextWeekday(2);
const monday = addDays(tuesday, -1);
const wednesday = addDays(tuesday, 1);
const sunday = addDays(tuesday, 5);
/** "Tue 22 Sep 2026", as the day view heads a day. */
const longLabel = (date: string): string => `${dayLabel(date)} ${date.slice(0, 4)}`;
/** "Mon 21", as the week view names its days. */
const weekLink = (date: string): RegExp => new RegExp(`^${dayLabel(date).split(' ').slice(0, 2).join(' ')}`);
/** The first day of the month after the one a day is in. */
const nextMonth = (date: string): string => `${addDays(`${date.slice(0, 8)}01`, 32).slice(0, 8)}01`;
test.describe('instructor diary (DIA-03, DIA-04, M1-19)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows a day, with the state of every lesson on it', async ({ page }, testInfo) => {
    await page.goto(`/app/instructor/diary?view=day&date=${tuesday}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();
    await expect(page.getByText(longLabel(tuesday))).toBeVisible();

    const lessons = page.getByRole('article');
    await expect(lessons.first()).toBeVisible();
    // Every lesson says who it is with, when, and where the money stands (DIA-04).
    await expect(lessons.first()).toContainText(/Paid|Unpaid|Credit|Test day|Cancelled|Pending|Completed/);
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-day');
  });

  test('moves a day at a time, and back to today', async ({ page }) => {
    await page.goto(`/app/instructor/diary?view=day&date=${tuesday}`);
    // The portal has a Today tab of its own, so this is the diary's own navigation.
    const diary = page.getByRole('navigation', { name: 'Diary' });

    await diary.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(new RegExp(`date=${wednesday}`));
    await expect(page.getByText(longLabel(wednesday))).toBeVisible();

    await diary.getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(new RegExp(`date=${tuesday}`));

    // The day these tests start from is never today, so going back to today always leaves it.
    await diary.getByRole('link', { name: 'Today' }).click();
    await expect(page).not.toHaveURL(new RegExp(`date=${tuesday}`));
  });

  test('says so plainly when a day is empty', async ({ page }) => {
    // Well past the seeded fortnight.
    await page.goto('/app/instructor/diary?view=day&date=2027-06-14');

    await expect(page.getByText('Nothing booked')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test.describe('diary week view (DIA-03, M1-20)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows a whole week, seven days across', { tag: '@desktop-only' }, async ({ page }, testInfo) => {
    await page.goto(`/app/instructor/diary?view=week&date=${tuesday}`);

    // Weeks start on Monday, so this runs from the Monday before to the Sunday after.
    const week = page.getByRole('list').filter({ hasText: 'Mon' }).first();
    await expect(page.getByRole('link', { name: weekLink(monday) })).toBeVisible();
    await expect(page.getByRole('link', { name: weekLink(sunday) })).toBeVisible();
    await expect(week).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-week');
  });

  test('a day in the week opens that day', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto(`/app/instructor/diary?view=week&date=${tuesday}`);

    await page.getByRole('link', { name: weekLink(wednesday) }).click();

    await expect(page).toHaveURL(new RegExp(`view=day&date=${wednesday}`));
    await expect(page.getByText(longLabel(wednesday))).toBeVisible();
  });

  test('shows the day on a phone and the week on a desktop when nobody has chosen', async ({ page }, testInfo) => {
    await page.goto(`/app/instructor/diary?date=${tuesday}`);

    const mondayHeading = page.getByRole('link', { name: weekLink(monday) });
    if (testInfo.project.name === 'mobile') {
      await expect(mondayHeading).toBeHidden();
      // How many there are moves with the seed; that the day is summed up does not.
      await expect(page.getByText(/^\d+ lessons?, \d+ hours?/)).toBeVisible();
    } else {
      await expect(mondayHeading).toBeVisible();
    }
    // The view chips highlight a different view at each width, so both are read at both.
    await expectAccessible(page);
  });
});

test.describe('diary month view (DIA-03, M1-21)', () => {
  test.use({ storageState: authFile('instructor') });

  test('marks the days with lessons and opens the one chosen', async ({ page }, testInfo) => {
    await page.goto(`/app/instructor/diary?view=month&date=${tuesday}`);
    await expect(page.getByRole('heading', { name: dayWords(tuesday, { month: 'long', year: 'numeric' }) })).toBeVisible();

    // Definition of done: a day in the month opens that day.
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-month');
    await page.getByRole('button', { name: dayWords(tuesday, { weekday: 'long', day: 'numeric', month: 'long' }) }).click();

    await expect(page).toHaveURL(new RegExp(`view=day&date=${tuesday}`));
    await expect(page.getByText(/^\d+ lessons?, \d+ hours?|^Nothing booked/)).toBeVisible();
  });

  test('moves a month at a time', async ({ page }) => {
    await page.goto(`/app/instructor/diary?view=month&date=${tuesday}`);

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('heading', { name: dayWords(nextMonth(tuesday), { month: 'long', year: 'numeric' }) })).toBeVisible();
  });
});
