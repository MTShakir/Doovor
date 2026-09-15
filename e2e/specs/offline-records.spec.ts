import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, lessonEvents, lessonIdAt, lessonRecordFor, removeLesson } from '../support/database';
import { addDays, dayLabel, expectAccessible, fillUntil, settled, snap } from '../support/helpers';
import { keptOwnerOnDevice, outboxRecords, readyWithNoSignal } from '../support/offline';

/*
 * Lesson records saved with no signal (PRD 8.1, 17.2, PRG-09, M4-11, M4-13).
 *
 * The phone opens Today and the lesson's screen with signal first, as it would at the start of the
 * day. Each test records a lesson on a day of its own, well before the seed's lessons, a different
 * one for each test and width.
 */

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** Opens Today and a lesson's record with signal, and waits until the phone can draw both without. */
const openWithSignal = async (page: Page, lessonId: string) => {
  await page.goto('/app/instructor');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect.poll(() => keptOwnerOnDevice(page), { timeout: 30_000 }).not.toBeNull();
  await expect.poll(() => readyWithNoSignal(page, '/app/instructor'), { timeout: 30_000 }).toBe(true);

  await page.goto(`/app/instructor/lessons/${lessonId}?record=1`);
  await expect(page.getByRole('form', { name: 'Lesson record' })).toBeVisible();
  await expect.poll(() => readyWithNoSignal(page, `/app/instructor/lessons/${lessonId}`), { timeout: 30_000 }).toBe(true);
};

/** Writes the record on the form and saves it. */
const writeAndSave = async (page: Page, summary: string) => {
  const form = page.getByRole('form', { name: 'Lesson record' });
  await form.getByRole('list', { name: 'Skills' }).getByRole('button', { name: 'Junctions' }).click();
  await form.getByRole('radiogroup', { name: 'Junctions, from 1 to 5' }).getByRole('radio', { name: '3, Prompted' }).click();
  await fillUntil(form.getByLabel('How did it go?'), summary);
  await form.getByRole('button', { name: 'Save record' }).click();
};

/** Emma Clarke, who teaches for a school, records lessons of Amelia Evans. */
test.describe('lesson records saved with no signal (PRG-09, M4-11)', () => {
  test.use({ storageState: authFile('schoolInstructor') });
  const learner = { email: 'amelia.evans@example.com', name: 'Amelia Evans' };

  test('waits on the phone, and is sent once when the signal is back', async ({ page, context }, testInfo) => {
    const day = addDays(today(), testInfo.project.name === 'mobile' ? -6 : -8);
    await bookLesson('Emma Clarke', learner.email, day, '08:00');
    const lessonId = await lessonIdAt('Emma Clarke', day, '08:00');
    const summary = `Moving off on a hill, with no signal, ${testInfo.project.name}.`;

    try {
      await openWithSignal(page, lessonId);

      await context.setOffline(true);
      let kept: { id: string; body?: unknown } | undefined;
      try {
        await page.reload();
        await writeAndSave(page, summary);
        // Back on Today, which says what became of it: a whole page with no signal, so no passing toast.
        await expect(page).toHaveURL(/\/app\/instructor$/);
        await expect(page.getByRole('status').filter({ hasText: '1 record saved on this phone, waiting to send.' })).toBeVisible();

        const waiting = await outboxRecords(page);
        expect(waiting).toEqual([expect.objectContaining({ bookingId: lessonId, state: 'waiting' })]);
        kept = waiting[0];
        expect(await lessonRecordFor(lessonId)).toBeNull();
        await expectAccessible(page);
        await settled(page);
        await snap(page, testInfo, 'record-waiting-no-signal');
      } finally {
        await context.setOffline(false);
      }

      // The signal is back: the phone sends it, and the lesson has its record.
      await expect
        .poll(() => lessonRecordFor(lessonId), { timeout: 30_000 })
        .toMatchObject({ summary, ratings: ['JUNCTIONS:3'], lessonStatus: 'completed' });
      await expect.poll(() => outboxRecords(page)).toEqual([]);
      await expect(page.getByRole('status').filter({ hasText: 'waiting to send' })).toBeHidden();

      // Sent again, as by a phone that never heard back: the server has it already, and keeps the one.
      const again = await page.evaluate(async (body) => {
        const answer = await fetch('/api/v1/lesson-records', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { status: answer.status, json: (await answer.json()) as unknown };
      }, kept?.body);
      expect(again).toEqual({ status: 200, json: { ok: true, data: { id: kept?.id, saved: false, completed: false } } });
    } finally {
      await removeLesson('Emma Clarke', learner.email, day, '08:00');
    }
  });

  test('says so when another phone recorded the lesson meanwhile, until it is read', async ({ page, context, browser }, testInfo) => {
    const day = addDays(today(), testInfo.project.name === 'mobile' ? -10 : -12);
    await bookLesson('Emma Clarke', learner.email, day, '08:00');
    const lessonId = await lessonIdAt('Emma Clarke', day, '08:00');

    try {
      await openWithSignal(page, lessonId);

      await context.setOffline(true);
      try {
        await page.reload();
        await writeAndSave(page, `Written with no signal, ${testInfo.project.name}.`);
        await expect(page.getByRole('status').filter({ hasText: '1 record saved on this phone, waiting to send.' })).toBeVisible();

        // Meanwhile, on another phone with signal, the same lesson gets its record.
        const otherPhone = await browser.newContext({ storageState: authFile('schoolInstructor') });
        try {
          const saved = await otherPhone.request.post('/api/v1/lesson-records', {
            headers: { origin: new URL(page.url()).origin },
            data: { id: crypto.randomUUID(), bookingId: lessonId, ratings: [{ skillCode: 'CTRL', rating: 4 }], summary: 'Saved on the other phone' },
          });
          expect(saved.status()).toBe(201);
        } finally {
          await otherPhone.close();
        }
      } finally {
        await context.setOffline(false);
      }

      const notice = page.getByRole('alert').filter({ hasText: 'The lesson already has a record, saved from another phone.' });
      await expect(notice).toBeVisible({ timeout: 30_000 });
      await expect(notice).toContainText(`Record for ${learner.name}, ${dayLabel(day)} at 08:00, not saved.`);
      await settled(page);
      await snap(page, testInfo, 'record-conflict');

      await notice.getByRole('button', { name: 'Dismiss' }).click();
      await expect(notice).toBeHidden();
      await expect.poll(() => outboxRecords(page)).toEqual([]);
      // The other phone's record is the lesson's.
      expect(await lessonRecordFor(lessonId)).toMatchObject({ summary: 'Saved on the other phone', ratings: ['CTRL:4'] });
    } finally {
      await removeLesson('Emma Clarke', learner.email, day, '08:00');
    }
  });
});

/**
 * PRD 17.2, acceptance test 8: a lesson record is saved in airplane mode and appears for the learner
 * after reconnecting. Sarah Khan records a lesson of Jack Taylor's at an hour nothing else books.
 */
test.describe('acceptance-08 (PRG-09, NTF-03, M4-13)', () => {
  test.use({ storageState: authFile('instructor') });
  const learner = 'jack.taylor@example.com';

  test('acceptance-08: a record saved in airplane mode appears for the learner after reconnecting', async ({ page, context, browser }, testInfo) => {
    const day = addDays(today(), testInfo.project.name === 'mobile' ? -9 : -11);
    // How the record's card is named on the timeline, with the year for a lesson in another year.
    const cardName = `${dayLabel(day)}${day.slice(0, 4) === today().slice(0, 4) ? '' : ` ${day.slice(0, 4)}`} at 05:00`;
    const summary = `Parallel parking in airplane mode, ${testInfo.project.name}.`;
    await bookLesson('Sarah Khan', learner, day, '05:00');
    const lessonId = await lessonIdAt('Sarah Khan', day, '05:00');

    try {
      await openWithSignal(page, lessonId);

      // Airplane mode: the record is written and saved, and nothing reaches the server.
      await context.setOffline(true);
      try {
        await page.reload();
        await writeAndSave(page, summary);
        await expect(page.getByRole('status').filter({ hasText: '1 record saved on this phone, waiting to send.' })).toBeVisible();
        expect(await lessonRecordFor(lessonId)).toBeNull();
      } finally {
        await context.setOffline(false);
      }

      // Reconnected: the phone sends it, and the lesson has its record, once.
      await expect
        .poll(() => lessonRecordFor(lessonId), { timeout: 30_000 })
        .toMatchObject({ summary, ratings: ['JUNCTIONS:3'], lessonStatus: 'completed' });
      await expect.poll(() => outboxRecords(page)).toEqual([]);
      const added = await lessonEvents(lessonId, 'lesson_record.added');
      expect(added).toHaveLength(1);

      // Jack is told. The job runner is not part of a local run, so the test hands the job the event.
      const job = await page.request.post('/dev/events', { data: added[0] });
      expect(await job.json()).toEqual({ written: 1 });

      const jack = await browser.newContext({ storageState: authFile('learner') });
      try {
        const phone = await jack.newPage();
        await phone.goto('/notifications');
        const told = phone.getByRole('article').filter({ hasText: 'Your lesson record is ready' }).filter({ hasText: `${dayLabel(day)} at 05:00` });
        await expect(told).toContainText(`${dayLabel(day)} at 05:00 with Sarah Khan. ${summary}`);
        await told.getByRole('link', { name: 'Open' }).click();

        // And reads the record on their progress, paging back to it as they would.
        await expect(phone).toHaveURL(/\/app\/learner\/progress$/);
        const records = phone.getByRole('list', { name: 'Lesson records' });
        const record = records.getByRole('article', { name: cardName });
        await expect(records.getByRole('listitem').first()).toBeVisible();
        for (let pages = 0; pages < 10 && !(await record.isVisible()); pages += 1) {
          const shown = await records.getByRole('listitem').count();
          await phone.getByRole('button', { name: 'Show older records' }).click();
          await expect(records.getByRole('listitem')).not.toHaveCount(shown);
        }
        await expect(record).toContainText(summary);
        await expect(record).toContainText('Sarah Khan');
        await expect(record.getByRole('img', { name: 'Junctions: 3 of 5, Prompted' })).toBeVisible();
        await expectAccessible(phone);
        await settled(phone);
        await snap(phone, testInfo, 'acceptance-08');
      } finally {
        await jack.close();
      }
    } finally {
      await removeLesson('Sarah Khan', learner, day, '05:00');
    }
  });
});
