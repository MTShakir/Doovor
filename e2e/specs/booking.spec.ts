import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { clearDiary } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/** The instructor's three taps: who it is for, when it is, and yes (BOK-01, BOK-03, M2-16). */
test.describe('booking a lesson (BOK-01, M2-16)', () => {
  test.use({ storageState: authFile('instructor') });

  /**
   * A Wednesday of its own for every test at every width: they all book into one seeded
   * diary, in parallel, so sharing a day would mean testing each other's bookings. Well
   * ahead of the fortnight the seed fills, too.
   */
  const openDay = (project: string, nth: number): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (3 + nth + (project === 'mobile' ? 0 : 3)));
    while (day.getDay() !== 3) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  /** However the last run ended, this one starts with an empty day. */
  const emptyDay = async (project: string, nth: number): Promise<string> => {
    const day = openDay(project, nth);
    await clearDiary('Sarah Khan', day);
    return day;
  };

  test('books in three taps from the diary', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 0);
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();

    // Tap one: open the sheet, which already knows the day the diary is showing.
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByRole('dialog', { name: 'Book a lesson' });
    await expect(sheet.getByLabel('Which day?')).toHaveValue(day);
    await expect(sheet.getByRole('group', { name: /^Times on/ })).toBeVisible();

    // Tap two: the learner, and the time. Jack's usual lesson is an hour, so that is chosen.
    await sheet.getByLabel('Who is it for?').selectOption({ label: 'Jack Taylor' });
    await expect(sheet.getByLabel('How long?')).toHaveValue(/.+/);
    await expect(sheet.getByLabel('How long?')).toContainText('Standard lesson, 1 hour, £42');
    await expect(sheet.getByRole('group', { name: /^Times on/ })).toBeVisible();
    await sheet.getByRole('button', { name: '14:00' }).click();
    await expectAccessible(page);
    await snap(page, testInfo, 'booking-sheet', { fullPage: false });

    // Tap three: confirm. The button says what it will cost before it is pressed.
    await expect(sheet.getByRole('button', { name: /^Book 14:00 for £/ })).toBeEnabled();
    await sheet.getByRole('button', { name: /^Book 14:00 for £/ }).click();

    await expect(page.getByText('Booked for')).toBeVisible();
    await expect(sheet).toBeHidden();

    // The diary shows it without being asked twice.
    await expect(page.getByRole('article').filter({ hasText: 'Jack Taylor' }).filter({ hasText: '14:00' })).toBeVisible();
  });

  test('warns before booking outside the hours they teach (R-04)', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 1);
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByRole('dialog', { name: 'Book a lesson' });

    // Sarah teaches until six, so the evening is offered separately.
    const evening = sheet.getByRole('group', { name: 'Times outside your hours' });
    await expect(evening).toBeVisible();
    await evening.getByRole('button', { name: '20:00' }).click();

    await expect(sheet.getByText('20:00 is outside the hours you teach')).toBeVisible();
    await snap(page, testInfo, 'booking-outside-hours', { fullPage: false });
    await expect(sheet.getByRole('button', { name: /^Book 20:00 for £/ })).toBeEnabled();
  });

  test('a taken slot is not offered twice @desktop-only', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 2);
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByLabel('Who is it for?');
    await sheet.selectOption({ label: 'Olivia Brown' });
    // Olivia usually books ninety minutes; this one is an hour, so the arithmetic is plain.
    await page.getByLabel('How long?').selectOption({ label: 'Standard lesson, 1 hour, £42' });
    await page.getByRole('button', { name: '09:00' }).click();
    await page.getByRole('button', { name: /^Book 09:00 for £/ }).click();
    await expect(page.getByText('Booked for')).toBeVisible();

    // Nine is gone, and so is half past, because the lesson runs to ten and the travel to half past.
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const times = page.getByRole('dialog', { name: 'Book a lesson' });
    await expect(times.getByRole('button', { name: '10:30' })).toBeVisible();
    await expect(times.getByRole('button', { name: '09:00' })).toBeHidden();
    await expect(times.getByRole('button', { name: '09:30' })).toBeHidden();
  });
});
