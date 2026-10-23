import { expect, test } from '@playwright/test';
import { bookLesson, makeSchoolInstructor, makeSchoolLearner, removeLesson, withDatabase } from '../support/database';
import { expectAccessible, openDiaryLesson, snap, tapUntil } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** A weekday of this spec's own, three weeks out, well clear of the seeded fortnight. */
function inThreeWeeks(): string {
  const at = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);
}

/**
 * A lesson an instructor lengthens, and a travel gap they say is not needed (BOK-03, BOK-07,
 * D-187). An instructor and a learner of this test's own at each width, because both widths
 * change the same diary otherwise.
 */
test.describe('a lesson an instructor can lengthen, and a gap they can skip (BOK-03, BOK-07, D-187)', () => {
  test('turns an hour into two, then books the next one back to back', async ({ page }, testInfo) => {
    const instructor = await makeSchoolInstructor(`Timings ${testInfo.project.name}`);
    const learner = await makeSchoolLearner(`Tess ${testInfo.project.name}`, { postcode: 'LS6 3QS', transmission: 'manual', instructorName: instructor.name });
    const day = inThreeWeeks();
    const time = testInfo.project.name === 'mobile' ? '09:00' : '13:00';
    const after = testInfo.project.name === 'mobile' ? '11:00' : '15:00';
    await bookLesson(instructor.name, learner.email, day, time);

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto(`/app/instructor/diary?view=day&date=${day}`);
      await expect(page.getByText(learner.name)).toBeVisible();

      // An hour becomes two, and the price says what that costs before it happens. Editing is
      // two steps: the card opens the lesson, and its sheet edits it (D-194).
      const moving = page.getByRole('dialog', { name: `Edit ${learner.name}'s lesson` });
      const actions = await openDiaryLesson(page, time, learner.name);
      await actions.getByRole('button', { name: 'Edit lesson' }).click();
      await expect(moving).toBeVisible();
      await moving.getByLabel('How long?').selectOption({ label: '2 hours' });
      await expect(moving.getByText(/^2 hours costs £\d+/)).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'lesson-length');
      // The same time, now twice as long: the lesson being moved is not in its own way.
      await moving.getByRole('button', { name: time, exact: true }).click();
      await moving.getByRole('button', { name: new RegExp(`^Move to ${time}$`) }).click();
      // Moving one asks whether the learner has been told (D-200).
      await page.getByRole('button', { name: 'Yes, I have told them' }).click();
      await expect(page.getByText(/^Moved to /)).toBeVisible();
      await expect(page.getByRole('article', { name: `${time} ${learner.name}` })).toContainText(after);

      // The next lesson starts the minute that one ends, which the travel gap would refuse.
      const booking = page.getByRole('dialog', { name: 'Book a lesson' });
      await tapUntil(page.getByRole('button', { name: 'Book a lesson' }).first(), booking);
      await booking.getByLabel('Who is it for?').selectOption({ label: learner.name });
      await expect(booking.getByRole('button', { name: after })).toHaveCount(0);

      await booking.getByRole('checkbox', { name: 'No gap needed after the lesson before' }).check();
      await booking.getByRole('button', { name: after }).click();
      await booking.getByRole('button', { name: new RegExp(`^Book ${after}$|^Book`) }).click();
      await expect(page.getByText(/^Booked for /)).toBeVisible();
      // The lesson before ends at the same minute, so the card is found by its own name.
      await expect(page.getByRole('article', { name: `${after} ${learner.name}` })).toBeVisible();
    } finally {
      await removeLesson(instructor.name, learner.email, day, time);
      await removeLesson(instructor.name, learner.email, day, after);
      await learner.remove();
      await instructor.remove();
    }
  });

  test('says what becomes of the cash paid for a lesson before its length is changed (D-188, D-381)', async ({ page }, testInfo) => {
    const instructor = await makeSchoolInstructor(`Lengths ${testInfo.project.name}`);
    const learner = await makeSchoolLearner(`Lena ${testInfo.project.name}`, { postcode: 'LS6 3QS', transmission: 'manual', instructorName: instructor.name });
    const day = inThreeWeeks();
    const time = '10:00';
    await bookLesson(instructor.name, learner.email, day, time);
    // Paid in cash, as the lesson's own status says. Nothing is moved here, so no payment needs
    // to exist for it to go back, and none is left behind in the school's figures afterwards.
    await withDatabase((sql) => sql`
      update public.bookings b set payment_status = 'paid_cash'
        from public.users u
       where u.id = b.learner_id and lower(u.email) = lower(${learner.email})
         and b.starts_at = (${day}::date + ${time}::time) at time zone 'Europe/London'`);

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto(`/app/instructor/diary?view=day&date=${day}`);
      await expect(page.getByText(learner.name)).toBeVisible();

      // A new length starts the money again, which the sheet says before anything is changed.
      const editing = page.getByRole('dialog', { name: `Edit ${learner.name}'s lesson` });
      const again = await openDiaryLesson(page, time, learner.name);
      await again.getByRole('button', { name: 'Edit lesson' }).click();
      await expect(editing).toBeVisible();
      await expect(editing).not.toContainText('owed back');
      await editing.getByLabel('How long?').selectOption({ label: '2 hours' });
      await expect(editing.getByText(/^2 hours costs £\d+/)).toContainText(
        /The £\d+(\.\d\d)? they paid is owed back to them: mark it handed back on their learner card once it is\. They then pay the £\d+(\.\d\d)? the way they pay for any lesson\./,
      );
      await snap(page, testInfo, 'lesson-length-paid');
    } finally {
      await removeLesson(instructor.name, learner.email, day, time);
      await learner.remove();
      await instructor.remove();
    }
  });
});
