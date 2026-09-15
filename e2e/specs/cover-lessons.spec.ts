import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { bookLesson, removeLesson, userIdOf } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * A cover lesson (DIA-03, BOK-01, D-097). The school gives Polly Payne, who learns with Tom Walsh,
 * a lesson with Emma Clarke. Emma's diary says who it is with, and Polly stays Tom's learner.
 */
test.describe('a cover lesson in the covering instructor’s diary (DIA-03, BOK-01)', () => {
  test.use({ storageState: authFile('schoolInstructor') });

  const learner = { email: roles.payer.email, name: 'Polly Payne' };
  const hour = '10:00';

  /** A Sunday of its own for each width, far past the seeded diary and every other spec's days. */
  const coverDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (50 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 0) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  test('says who the lesson is with, without making the learner hers', async ({ page }, testInfo) => {
    const day = coverDay(testInfo.project.name);
    // Booked for Emma by somebody else, as the school's office does when Tom is away.
    await bookLesson('Emma Clarke', learner.email, day, hour);

    try {
      // The diary as it opens on that day: the day on a phone, the week on a desktop.
      await page.goto(`/app/instructor/diary?date=${day}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();
      const lesson = page.getByRole('article', { name: `${hour} ${learner.name}` });
      await expect(lesson).toBeVisible();
      await expect(lesson).toContainText(learner.name);
      await expectAccessible(page);
      await snap(page, testInfo, 'diary-cover-lesson');

      // A lesson is not a learner (LRN-06): Polly is not on Emma's list, and her card is not Emma's to open.
      await page.goto('/app/instructor/learners');
      await expect(page.getByRole('link', { name: 'Amelia Evans', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: learner.name, exact: true })).toHaveCount(0);
      await page.goto(`/app/instructor/learners/${await userIdOf(learner.email)}`);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    } finally {
      await removeLesson('Emma Clarke', learner.email, day, hour);
    }
  });
});
