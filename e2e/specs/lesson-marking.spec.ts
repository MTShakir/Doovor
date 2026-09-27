import { expect, test } from '@playwright/test';
import { bookLesson, makeSchoolInstructor, makeSchoolLearner, removeLesson } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** The London day and time some minutes either side of now, as the booking helpers take them. */
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
 * When a lesson can be marked (BOK-10, R-09, D-213).
 *
 * Done used to appear the minute a lesson began, so an instructor teaching a two hour lesson had a
 * button on the card offering to say it was finished, an hour and a half before it was. The
 * answers now wait until the lesson's time is up.
 *
 * Both lessons are booked against the wall clock, like start-lesson.spec.ts, so they need an
 * instructor and a learner of their own at each width: the hour a run starts at decides where they
 * land, and a seeded learner has lessons of their own to crash into.
 */
test.describe('when a lesson can be marked (BOK-10, R-09, D-213)', () => {
  test('offers nothing while it is being taught, and both answers once it is over', async ({ page }, testInfo) => {
    const running = inMinutes(-20);
    const finished = inMinutes(-180);
    // Near midnight the two fall on different days, and a day view shows one day.
    test.skip(running.day !== finished.day, 'The two lessons are on different days at this hour');

    const instructor = await makeSchoolInstructor(`Marker ${testInfo.project.name}`);
    const taught = await makeSchoolLearner(`Marker Learner ${testInfo.project.name}`, {
      postcode: 'M1 2QF',
      transmission: 'manual',
      instructorName: instructor.name,
    });
    await bookLesson(instructor.name, taught.email, running.day, running.time);
    await bookLesson(instructor.name, taught.email, finished.day, finished.time);

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto(`/app/instructor/diary?view=day&date=${running.day}`);

      // Being taught right now: nothing to say about it yet, and too late to move it.
      const now = page.getByRole('article').filter({ hasText: running.time });
      await expect(now).toBeVisible();
      await expect(now.getByRole('button', { name: 'Done' })).toHaveCount(0);
      await expect(now.getByRole('button', { name: 'No show' })).toHaveCount(0);
      await expect(now.getByRole('button', { name: 'Edit lesson' })).toHaveCount(0);

      // Over three hours ago: both answers are there.
      const over = page.getByRole('article').filter({ hasText: finished.time });
      await expect(over.getByRole('button', { name: 'Done' })).toBeVisible();
      await expect(over.getByRole('button', { name: 'No show' })).toBeVisible();

      await expectAccessible(page);
      await snap(page, testInfo, 'diary-lesson-running');
    } finally {
      await removeLesson(instructor.name, taught.email, running.day, running.time);
      await removeLesson(instructor.name, taught.email, finished.day, finished.time);
      await taught.remove();
      await instructor.remove();
    }
  });
});
