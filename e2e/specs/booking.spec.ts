import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { acceptRequests, clearDiary, requestLesson } from '../support/database';
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
    // A week each for the tests that book one lesson, and a stretch far enough out for the
    // one that books four, so its later weeks cannot land on anybody else's day.
    const weeks = nth < 8 ? 3 + nth : 22;
    const day = new Date();
    day.setDate(day.getDate() + 7 * (weeks + (project === 'mobile' ? 0 : 6)));
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

  test('books the same slot every week (BOK-05) @desktop-only', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 8);
    const nextWeek = new Date(`${day}T12:00:00Z`);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const after = nextWeek.toISOString().slice(0, 10);
    await clearDiary('Sarah Khan', after);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await tapUntil(
      page.getByRole('button', { name: 'Book a lesson' }).first(),
      page.getByRole('dialog', { name: 'Book a lesson' }),
    );
    const sheet = page.getByRole('dialog', { name: 'Book a lesson' });
    await sheet.getByLabel('Who is it for?').selectOption({ label: 'Jack Taylor' });
    await sheet.getByLabel('How often?').selectOption('4');
    await sheet.getByRole('button', { name: '13:00' }).click();
    await sheet.getByRole('button', { name: /^Book 13:00 for £/ }).click();

    await expect(page.getByText('4 lessons booked, 13:00 every week')).toBeVisible();

    // The week after has the same lesson at the same time.
    await page.goto(`/app/instructor/diary?view=day&date=${after}`);
    await expect(
      page.getByRole('article').filter({ hasText: 'Jack Taylor' }).filter({ hasText: '13:00' }),
    ).toBeVisible();
  });

  test('moves a lesson to another time (BOK-08)', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 4);
    await requestLesson('Sarah Khan', 'jack.taylor@example.com', day, '09:00');
    await acceptRequests('Sarah Khan', day);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article').filter({ hasText: 'Jack Taylor' });
    await expect(lesson).toContainText('09:00');

    await tapUntil(lesson.getByRole('button', { name: 'Move' }), page.getByRole('dialog', { name: /^Move Jack/ }));
    await page.getByRole('button', { name: '15:00' }).click();
    await page.getByRole('button', { name: 'Move to 15:00' }).click();

    await expect(page.getByText('Moved to')).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: 'Jack Taylor' })).toContainText('15:00', {
      timeout: 30_000,
    });
  });

  test('cancels a lesson, and has to say why (BOK-09) @desktop-only', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 5);
    await requestLesson('Sarah Khan', 'olivia.brown@example.com', day, '11:00');
    await acceptRequests('Sarah Khan', day);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article').filter({ hasText: 'Olivia Brown' });

    await tapUntil(lesson.getByRole('button', { name: 'Cancel' }), page.getByRole('dialog', { name: /^Cancel Olivia/ }));
    // Nothing happens until there is a reason to give the learner (R-08).
    await expect(page.getByRole('button', { name: 'Cancel the lesson' })).toBeDisabled();
    await page.getByLabel('Why?').fill('Car in for repair');
    await expect(page.getByRole('button', { name: 'Cancel the lesson' })).toBeEnabled();
    await expectAccessible(page);
    await snap(page, testInfo, 'booking-cancel', { fullPage: false });
    await page.getByRole('button', { name: 'Cancel the lesson' }).click();

    await expect(page.getByText('Lesson with Olivia Brown cancelled')).toBeVisible();
    // The diary catches up on its own. A development server under four workers is slow at it,
    // which is why this waits longer than the default.
    await expect(lesson).toContainText('Cancelled', { timeout: 30_000 });
  });

  test('drags a lesson into a gap (DIA-03, BOK-08) @desktop-only', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 6);
    await requestLesson('Sarah Khan', 'jack.taylor@example.com', day, '09:00');
    await acceptRequests('Sarah Khan', day);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article', { name: '09:00 Jack Taylor' });
    await expect(lesson).toBeVisible();

    // The gap after it is a place to drop one.
    const gap = page.getByText(/^Free until/);
    await expect(gap).toBeVisible();
    await lesson.dragTo(gap);

    // The gap starts when the lesson before it ends, so that is where it lands.
    await expect(page.getByText('Moved to')).toBeVisible();
    await expect(page.getByRole('article', { name: '09:00 Jack Taylor' })).toBeHidden();
    await expect(page.getByRole('article').filter({ hasText: 'Jack Taylor' })).toContainText('10:00');
  });

  test('holds a lesson on a phone to move it @phone-only', async ({ page }, testInfo) => {
    const day = await emptyDay(testInfo.project.name, 7);
    await requestLesson('Sarah Khan', 'olivia.brown@example.com', day, '09:00');
    await acceptRequests('Sarah Khan', day);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = page.getByRole('article', { name: '09:00 Olivia Brown' });
    await expect(lesson).toBeVisible();

    // A finger, not a mouse: Playwright's click is a mouse whatever the device is, and a
    // mouse drags a lesson rather than holding it. Once the sheet is open the diary behind
    // it is hidden from the page, so the hold is only tried while it is not.
    const sheet = page.getByRole('dialog', { name: /^Move Olivia/ });
    await expect(async () => {
      if (await sheet.isVisible()) return;
      await lesson.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole('button', { name: '13:00' }).click();
    await page.getByRole('button', { name: 'Move to 13:00' }).click();
    await expect(page.getByText('Moved to')).toBeVisible();
  });

  test('marks a lesson done, and one nobody came to (BOK-10, R-09) @desktop-only', async ({ page }, testInfo) => {
    // Yesterday, so both lessons are in the past and far enough apart to exist at once.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = yesterday.toISOString().slice(0, 10);
    await clearDiary('Sarah Khan', day);
    await requestLesson('Sarah Khan', 'jack.taylor@example.com', day, '09:00');
    await requestLesson('Sarah Khan', 'olivia.brown@example.com', day, '14:00');
    await acceptRequests('Sarah Khan', day);

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const taught = page.getByRole('article').filter({ hasText: 'Jack Taylor' });
    const absent = page.getByRole('article').filter({ hasText: 'Olivia Brown' });

    // A lesson in the past is asked about, not moved.
    await expect(taught.getByRole('button', { name: 'Move' })).toBeHidden();
    // Done opens the lesson's record, to be written straight after it (PRD 10.2, M4-05).
    await taught.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Marked as done')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Lesson record' })).toBeVisible();
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await expect(taught).toContainText('Completed');

    await absent.getByRole('button', { name: 'No show' }).click();
    await expect(page.getByText('Marked as no show')).toBeVisible();
    await expect(absent).toContainText('No-show');
    await snap(page, testInfo, 'diary-after-the-lesson');
  });
});
