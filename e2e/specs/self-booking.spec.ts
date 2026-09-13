import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { clearDiary } from '../support/database';
import { chooseDate, expectAccessible, snap } from '../support/helpers';

/** The link an instructor shares, on the phone it will be opened on (BOK-02, M2-17). */
test.describe('booking from a shared link (BOK-02, M2-17)', () => {
  /** A Tuesday of its own for each width, well past the fortnight the seed fills. */
  const openDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (6 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 2) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  /**
   * Opens the link and waits for the first answer about times, which is the page saying it
   * is listening: a day chosen before that is a day the page never hears about (D-043).
   */
  const openLink = async (page: Page): Promise<void> => {
    await page.goto('/book/sarah-khan');
    await expect(
      page.getByRole('group', { name: /^Times on/ }).or(page.getByText(/^Nothing free on/)),
    ).toBeVisible();
  };

  test('shows who a visitor would be booking with, and what it costs', async ({ page }, testInfo) => {
    await openLink(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    await expect(page.getByText('Volkswagen Polo')).toBeVisible();
    await expect(page.getByLabel('Which lesson?')).toContainText('Standard lesson, 1 hour, £42');

    // A day she actually teaches, so the times are the point of the picture.
    await chooseDate(page.getByLabel('Which day?'), openDay(testInfo.project.name));
    await expect(page.getByRole('group', { name: /^Times on/ })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'booking-link');
  });

  test('a link that belongs to nobody says so', async ({ page }) => {
    await page.goto('/book/not-an-instructor');
    await expect(page.getByRole('heading', { name: 'This link is not taking bookings' })).toBeVisible();
  });

  test('a visitor with no account is asked to make one first', async ({ page }, testInfo) => {
    const day = openDay(testInfo.project.name);
    await openLink(page);
    await chooseDate(page.getByLabel('Which day?'), day);

    const times = page.getByRole('group', { name: /^Times on/ });
    await expect(times).toBeVisible();
    await times.getByRole('button').first().click();
    await expect(page.getByRole('button', { name: /^Continue with \d\d:\d\d$/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Continue with \d\d:\d\d$/ }).click();

    // They are sent to make an account, and the time waits for them.
    await expect(page).toHaveURL(/\/start/);
  });

  test('acceptance-12: a learner books in under a minute', async ({ browser }, testInfo) => {
    const day = openDay(testInfo.project.name);
    await clearDiary('Sarah Khan', day);

    const context = await browser.newContext({ storageState: authFile('learner') });
    const page = await context.newPage();
    const started = Date.now();

    await openLink(page);
    await chooseDate(page.getByLabel('Which day?'), day);
    const times = page.getByRole('group', { name: /^Times on/ });
    await expect(times).toBeVisible();
    await times.getByRole('button', { name: '11:00' }).click();
    await page.getByRole('button', { name: /^Book 11:00 for £42$/ }).click();

    await expect(page.getByRole('heading', { name: 'Lesson booked' })).toBeVisible();
    await expect(page.getByText('with Sarah Khan')).toBeVisible();
    await snap(page, testInfo, 'booking-link-done');

    // acceptance-12: from opening the link to a booked lesson, on a phone, in under a minute.
    expect(Date.now() - started).toBeLessThan(60_000);

    // And it is really in the diary: the same time is no longer offered.
    await openLink(page);
    await chooseDate(page.getByLabel('Which day?'), day);
    await expect(times).toBeVisible();
    await expect(times.getByRole('button', { name: '11:00' })).toBeHidden();
    await context.close();
  });
});
