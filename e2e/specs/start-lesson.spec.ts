import { expect, test } from '@playwright/test';
import { bookLesson, makeSchoolInstructor, removeLesson } from '../support/database';
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
 * time, and both widths run at once, so each makes an instructor of its own to teach it.
 */
test.describe('the lesson about to be taught (PRD 7.5, D-178)', () => {
  test('carries Start lesson on its own card, and only once it is close', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    const learner = mobile ? 'harry.thomas@example.com' : 'tom.walsh@example.com';
    const instructor = await makeSchoolInstructor(`Starter ${testInfo.project.name}`);
    const soon = inMinutes(10);
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

      // It opens the lesson itself, where the timer runs.
      await starting.getByRole('link', { name: 'Start lesson' }).click();
      await expect(page).toHaveURL(/\/app\/instructor\/lessons\/[0-9a-f-]{36}$/);
    } finally {
      await removeLesson(instructor.name, learner, soon.day, soon.time);
      await removeLesson(instructor.name, learner, later.day, later.time);
      await instructor.remove();
    }
  });
});
