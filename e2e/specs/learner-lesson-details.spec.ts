import { expect, test } from '@playwright/test';
import { bookLesson, giveLearnerPickup, makeSchoolInstructor, makeSchoolLearner, removeLesson } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** A weekday of this spec's own, a fortnight out, so no other spec is looking at the same day. */
function inAFortnight(): string {
  const at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);
}

/**
 * A learner opens a lesson they have booked (PRD 8.2, COV-04, D-185): says where they are
 * collected from, and goes on to their instructor's profile and their school's. An instructor
 * and a learner of this test's own at each width, since it is their lesson that is changed.
 */
test.describe('a learner opens their own lesson (PRD 8.2, D-185)', () => {
  test('says where they are collected, and finds who is teaching them', async ({ page }, testInfo) => {
    const instructor = await makeSchoolInstructor(`Teacher ${testInfo.project.name}`);
    const learner = await makeSchoolLearner(`Petra ${testInfo.project.name}`, { postcode: 'LS6 3QS', transmission: 'manual' });
    const day = inAFortnight();
    const time = testInfo.project.name === 'mobile' ? '09:00' : '14:00';
    await bookLesson(instructor.name, learner.email, day, time);
    await giveLearnerPickup(learner.userId, 'Home', '12 Hyde Park Road, Leeds', 'LS6 1AB');

    try {
      await signInThroughForm(page, learner.email);
      await page.goto('/app/learner/lessons');

      // The card opens the lesson, the way an instructor opens a learner's card.
      await page.getByRole('link', { name: new RegExp(`^Open .* with ${instructor.name}$`) }).click();
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(time) })).toBeVisible();

      const where = page.getByRole('region', { name: 'Where you are collected' });
      // The lesson starts with none: the place they keep on their account is theirs to choose.
      await expect(where.getByLabel('Collect me from')).toHaveValue('');
      await where.getByLabel('Collect me from').selectOption({ label: 'Home, 12 Hyde Park Road, Leeds, LS6 1AB' });
      await expect(page.getByText('Your instructor collects you there')).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'learner-lesson-details');

      // It is on the lesson from then on, wherever the lesson is shown.
      await page.reload();
      await expect(where).toContainText('12 Hyde Park Road, Leeds, LS6 1AB');
      await page.goto('/app/learner/lessons');
      await expect(page.getByRole('article').filter({ hasText: instructor.name })).toContainText('Home');

      // And they can read up on who is teaching them, and on the school.
      await page.getByRole('link', { name: new RegExp(`^Open .* with ${instructor.name}$`) }).click();
      const who = page.getByRole('region', { name: 'Who is teaching you' });
      await expect(who).toContainText('Quayside Driving School');
      await expect(who.getByRole('link', { name: `See ${instructor.name}'s profile` })).toBeVisible();
      await who.getByRole('link', { name: 'See Quayside Driving School' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Quayside Driving School' })).toBeVisible();
    } finally {
      await removeLesson(instructor.name, learner.email, day, time);
      await learner.remove();
      await instructor.remove();
    }
  });
});
