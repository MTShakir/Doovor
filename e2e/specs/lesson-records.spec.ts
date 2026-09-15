import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, lessonEvents, lessonIdAt, lessonRecordFor, notificationChannels } from '../support/database';
import { addDays, dayLabel, expectAccessible, fillUntil, settled, snap } from '../support/helpers';

/**
 * Teaching a lesson and writing its record (PRD 7.5, 10.2, PRG-01, M4-04, M4-05).
 *
 * Sarah Khan teaches Jack Taylor. Each test books a lesson of its own, before the seed's first
 * lesson of the day, on a day of its own for each width, so the two widths never share one.
 */
test.describe('a lesson and its record (PRG-01, M4-04, M4-05)', () => {
  test.use({ storageState: authFile('instructor') });

  const learner = 'jack.taylor@example.com';
  const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

  /** Waits for the lesson screen to be listening, and for its draft to exist: a tap before that does nothing. */
  const ready = async (page: Page) => {
    await expect(page.locator('[data-lesson-ready="yes"]')).toBeAttached();
  };

  test('Today lists the day, and a lesson opens with a timer and the skills to tap', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    // Today, before the seed's first lesson and two hours apart for the two widths, and a day ahead
    // for the lesson to teach, which has not ended.
    const hour = mobile ? '04:00' : '06:00';
    await bookLesson('Sarah Khan', learner, today(), hour);
    const tomorrow = addDays(today(), mobile ? 1 : 2);
    await bookLesson('Sarah Khan', learner, tomorrow, '07:00');
    const lessonId = await lessonIdAt('Sarah Khan', tomorrow, '07:00');

    await page.goto('/app/instructor');
    const day = page.getByRole('list', { name: "Today's lessons" });
    await expect(day.getByRole('article', { name: `${hour} Jack Taylor` })).toContainText('Standard lesson');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'today-lessons');

    await page.goto(`/app/instructor/lessons/${lessonId}`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Jack Taylor' })).toBeVisible();
    await expect(page.getByText('Lesson in progress')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText(/^\d+:\d\d$/);

    const skills = page.getByRole('list', { name: 'Skills' });
    await skills.getByRole('button', { name: 'Junctions' }).click();
    await skills.getByRole('button', { name: 'Use of mirrors' }).click();
    await expect(skills.getByRole('button', { name: 'Junctions' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('2 tapped')).toBeVisible();

    // The taps are kept on the phone: a reload loses nothing.
    await page.reload();
    await ready(page);
    await expect(page.getByText('2 tapped')).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'lesson-in-progress');

    await page.getByRole('button', { name: 'Finish lesson' }).click();
    await expect(page.getByRole('form', { name: 'Lesson record' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Junctions, from 1 to 5' })).toBeVisible();
  });

  test('a record for a lesson that happened is written and saved in under a minute, and the learner is told (PRG-01, NTF-03)', async ({ page, browser }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    const day = addDays(today(), mobile ? -3 : -5);
    await bookLesson('Sarah Khan', learner, day, '07:00');
    const lessonId = await lessonIdAt('Sarah Khan', day, '07:00');

    const started = Date.now();
    await page.goto(`/app/instructor/lessons/${lessonId}?record=1`);
    await ready(page);
    const form = page.getByRole('form', { name: 'Lesson record' });
    await expect(page.getByText(`${dayLabel(day)} at 07:00`)).toBeVisible();

    const skills = form.getByRole('list', { name: 'Skills' });
    for (const skill of ['Junctions', 'Use of mirrors', 'Roundabouts']) {
      await skills.getByRole('button', { name: skill }).click();
    }
    await form.getByRole('radiogroup', { name: 'Junctions, from 1 to 5' }).getByRole('radio', { name: '3, Prompted' }).click();
    await form.getByRole('radiogroup', { name: 'Use of mirrors, from 1 to 5' }).getByRole('radio', { name: '4, Seldom prompted' }).click();
    await form.getByRole('radiogroup', { name: 'Roundabouts, from 1 to 5' }).getByRole('radio', { name: '2, Under full instruction' }).click();
    await expect(form.getByText('Seldom prompted')).toBeVisible();

    // Nothing is sent until every skill tapped is rated and there is a line about it.
    await form.getByRole('button', { name: 'Save record' }).click();
    await expect(form.getByRole('alert')).toHaveText('Write a line about the lesson.');

    await fillUntil(form.getByLabel('How did it go?'), 'Good junctions, mirrors checked early.');
    await fillUntil(form.getByLabel('Focus for next time'), 'Lane choice on roundabouts');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'lesson-record');

    await form.getByRole('button', { name: 'Save record' }).click();
    await expect(page.getByText('Lesson record saved')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/instructor$/);
    // PRG-01: from opening the record to saving it, in under a minute.
    expect(Date.now() - started).toBeLessThan(60_000);

    const saved = await lessonRecordFor(lessonId);
    expect(saved).toMatchObject({
      summary: 'Good junctions, mirrors checked early.',
      nextFocus: 'Lane choice on roundabouts',
      ratings: ['JUNCTIONS:3', 'MIRRORS:4', 'ROUNDABOUT:2'],
      // Saving the record marked the lesson done.
      lessonStatus: 'completed',
    });
    expect(saved?.secondsTaken).toBeLessThan(60);

    // Opened again, it says the record is saved rather than offering a second one.
    await page.goto(`/app/instructor/lessons/${lessonId}`);
    await expect(page.getByText('This lesson already has its record.')).toBeVisible();

    // PRD 10.2 step 4: Jack is told, in the inbox and on their phone (NTF-03, M4-12). The job runner
    // is not part of a local run, so the test hands the job the event the database wrote.
    const [added] = await lessonEvents(lessonId, 'lesson_record.added');
    expect(added?.payload).toMatchObject({ booking_id: lessonId });
    const recordId = String(added?.payload.lesson_record_id);
    const first = await page.request.post('/dev/events', { data: added });
    expect(await first.json()).toEqual({ written: 1 });
    // The same event again, as a job tried twice: nobody is told twice.
    const second = await page.request.post('/dev/events', { data: added });
    expect(await second.json()).toEqual({ written: 0 });
    expect(await notificationChannels(learner, 'lesson_record.added', recordId)).toEqual(['in_app', 'push']);

    const jack = await browser.newContext({ storageState: authFile('learner') });
    try {
      const inbox = await jack.newPage();
      await inbox.goto('/notifications');
      const told = inbox.getByRole('article').filter({ hasText: 'Your lesson record is ready' }).filter({ hasText: `${dayLabel(day)} at 07:00` });
      await expect(told).toContainText(`${dayLabel(day)} at 07:00 with Sarah Khan. Good junctions, mirrors checked early.`);
      await settled(inbox);
      await snap(inbox, testInfo, 'lesson-record-notice');
      await told.getByRole('link', { name: 'Open' }).click();
      await expect(inbox).toHaveURL(/\/app\/learner\/progress$/);
      await expect(inbox.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    } finally {
      await jack.close();
    }
  });
});
