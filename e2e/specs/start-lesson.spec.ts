import { expect, test } from '@playwright/test';
import { bookLesson, makeSchoolInstructor, makeSchoolLearner, removeLesson } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** The London day and time a few minutes from now, as the booking helpers take them. */
function inMinutes(minutes: number): { day: string; time: string } {
  const at = new Date(Date.now() + minutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((one) => one.type === type)?.value ?? '';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/**
 * Starting a lesson (PRD 7.5, D-178). A lesson minutes from now can only be in one diary at a
 * time, and both widths run at once, so each makes an instructor of its own to teach it, and a
 * learner of its own to teach.
 *
 * The learner used to be a seeded one, and that was a bug waiting for the right hour: these two
 * lessons are booked at the wall clock rather than at a chosen time, so they land wherever the run
 * happens to start. On 26 September a run at 06:34 put the later one at 08:34, across a seeded
 * 09:00 lesson the shared learner already had, and the whole suite went red on `main`. A learner
 * made for the test has an empty diary at every hour of the day.
 */
test.describe('the lesson about to be taught (PRD 7.5, D-178)', () => {
  test('carries Start lesson on its own card, and only once it is close', async ({ page }, testInfo) => {
    // A lesson ten minutes from now falls on tomorrow when it is nearly midnight, and Today is
    // about today, so the card this test is about is correctly somewhere else. The behaviour is
    // right; there is simply nothing here to assert until the hour passes.
    const soonest = inMinutes(10);
    test.skip(soonest.day !== inMinutes(0).day, 'Ten minutes from now is tomorrow, so Today has nothing to start');

    const instructor = await makeSchoolInstructor(`Starter ${testInfo.project.name}`);
    const taught = await makeSchoolLearner(`Starter Learner ${testInfo.project.name}`, {
      postcode: 'M1 2QF',
      transmission: 'manual',
      instructorName: instructor.name,
    });
    const learner = taught.email;
    const soon = soonest;
    const later = inMinutes(120);
    await bookLesson(instructor.name, learner, soon.day, soon.time);
    await bookLesson(instructor.name, learner, later.day, later.time);

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto('/app/instructor');
      const day = page.getByRole('list', { name: "Today's lessons" });
      const starting = day.getByRole('article').filter({ hasText: soon.time });
      await expect(starting.getByRole('link', { name: 'Start lesson' })).toBeVisible();

      // The one later today is on the same screen, and is not to be started yet.
      if (later.day === soon.day) {
        const waiting = day.getByRole('article').filter({ hasText: later.time });
        await expect(waiting).toBeVisible();
        await expect(waiting.getByRole('link', { name: 'Start lesson' })).toHaveCount(0);
      }
      await expect(page.getByRole('link', { name: 'Start lesson' })).toHaveCount(1);
      await expectAccessible(page);
      await snap(page, testInfo, 'start-lesson');

      // The lesson's own sheet offers it too, so it can be started from the pickup (D-184).
      await starting.getByRole('button', { name: /^Open / }).click();
      const sheet = page.getByRole('dialog').first();
      await expect(sheet.getByRole('link', { name: 'Start lesson' })).toBeVisible();
      await page.keyboard.press('Escape');

      // It opens the lesson itself, where the timer runs. The clock on screen is what says the
      // lesson has actually been started on this phone, which is what Today reads afterwards.
      await starting.getByRole('link', { name: 'Start lesson' }).click();
      await expect(page).toHaveURL(/\/app\/instructor\/lessons\/[0-9a-f-]{36}$/);
      await expect(page.getByRole('timer')).toBeVisible();

      // And back on Today the card counts the lesson up rather than offering to start it again.
      await page.goto('/app/instructor');
      await expect(starting.getByRole('link', { name: /^Lesson running/ })).toBeVisible();
      await expect(starting.getByRole('link', { name: 'Start lesson' })).toHaveCount(0);
      await snap(page, testInfo, 'lesson-running');
    } finally {
      await removeLesson(instructor.name, learner, soon.day, soon.time);
      await removeLesson(instructor.name, learner, later.day, later.time);
      await taught.remove();
      await instructor.remove();
    }
  });
});
