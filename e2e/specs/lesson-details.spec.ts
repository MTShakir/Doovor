import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, clearDiary, lessonEvents, lessonIdAt, notificationChannels, removeLesson } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/**
 * A lesson opened from its card (DIA-04, NTF-02, D-166): where to go, how to reach the learner,
 * a reminder sent by hand, and what can be done to it.
 *
 * Sarah Khan is on Pro, so a reminder may go by text, and Jack Taylor has a number. Sundays belong
 * to this spec (see the table in support/database.ts), each test and width a week of its own.
 */
test.describe('a lesson opened from its card (DIA-04, D-166)', () => {
  test.use({ storageState: authFile('instructor') });
  const learner = 'jack.taylor@example.com';

  const sunday = (project: string, nth: number): string => {
    const day = new Date();
    day.setDate(day.getDate() + 7 * (6 + nth * 2 + (project === 'mobile' ? 0 : 1)));
    while (day.getDay() !== 0) day.setDate(day.getDate() + 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
  };

  test('says where, how to reach the learner and what can be done, and sends a reminder', async ({ page }, testInfo) => {
    const day = sunday(testInfo.project.name, 0);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', learner, day, '10:00');
    const bookingId = await lessonIdAt('Sarah Khan', day, '10:00');

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const sheet = page.getByRole('dialog', { name: 'Jack Taylor' });
    await tapUntil(page.getByRole('button', { name: 'Open 10:00 with Jack Taylor' }), sheet);

    // How to reach them, straight from the lesson.
    await expect(sheet.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+447700900011');
    await expect(sheet.getByRole('link', { name: 'Text' })).toHaveAttribute('href', 'sms:+447700900011');
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/447700900011');
    await expect(sheet.getByRole('region', { name: 'This lesson' }).getByRole('button', { name: 'Edit lesson' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'lesson-details');

    // A reminder by email: the job is asked, and it reaches the learner the way reminders do.
    const reminders = sheet.getByRole('region', { name: 'Send a reminder' });
    await reminders.getByRole('button', { name: 'By email' }).click();
    await expect(page.getByText('Reminder on its way to Jack Taylor by email')).toBeVisible();
    const [asked] = await lessonEvents(bookingId, 'booking.reminder_requested');
    expect(asked?.payload.channel, 'the job was asked for it').toBe('email');
    expect((await page.request.post('/dev/events', { data: asked })).status()).toBe(200);
    expect(await notificationChannels(learner, 'booking.reminder', bookingId)).toContain('email');

    // Once an hour each way, and a text is a way of its own on Pro.
    await reminders.getByRole('button', { name: 'By email' }).click();
    await expect(page.getByText('A reminder went by email within the last hour')).toBeVisible();
    await reminders.getByRole('button', { name: 'By SMS' }).click();
    await expect(page.getByText('Reminder on its way to Jack Taylor by text')).toBeVisible();

    // Moving it from here opens the diary's own sheet for that.
    await sheet.getByRole('region', { name: 'This lesson' }).getByRole('button', { name: 'Edit lesson' }).click();
    await expect(page.getByRole('dialog', { name: /^Edit/ })).toBeVisible();
    await removeLesson('Sarah Khan', learner, day, '10:00');
  });

  test('starts where their lessons start, and goes somewhere else for one lesson (COV-04, D-215)', async ({ page }, testInfo) => {
    const day = sunday(testInfo.project.name, 2);
    await clearDiary('Sarah Khan', day);
    // Booked naming nowhere, the way the seed and the public booking page both do it.
    await bookLesson('Sarah Khan', learner, day, '11:00');

    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    const sheet = page.getByRole('dialog', { name: 'Jack Taylor' });
    await tapUntil(page.getByRole('button', { name: 'Open 11:00 with Jack Taylor' }), sheet);

    // D-215: nobody chose, so it starts where Jack's lessons start.
    const pickup = sheet.getByRole('region', { name: 'Pickup' });
    await expect(pickup).toContainText('Home');
    await expect(pickup).toContainText('LS2 9JT');

    // One lesson somewhere else, without touching where the rest of them start. The list is
    // behind Change while the lesson already has somewhere to start from (D-222).
    await pickup.getByRole('button', { name: 'Change' }).click();
    const choice = pickup.getByLabel('Collect them from');
    await expect(choice).toHaveValue(/[0-9a-f-]{36}/);
    await choice.selectOption('No pickup point');
    await expect(page.getByText('Pickup point taken off this lesson')).toBeVisible();
    await expect(pickup).toContainText('No pickup point on this lesson');
    await expectAccessible(page);
    await snap(page, testInfo, 'lesson-pickup');

    // With nowhere to be collected from, the list stands open: it is the only thing to do here.
    await choice.selectOption({ label: 'Home, Little London & Woodhouse, Leeds, LS2 9JT' });
    await expect(page.getByText('Collecting them from there')).toBeVisible();
    await expect(pickup).toContainText('LS2 9JT');

    // Nowhere to collect them from is the one case where the list opens itself, and it carries a
    // way out to the learner's own form (D-222). Choosing a place closes the list again, so it
    // takes another Change to get back to it.
    await pickup.getByRole('button', { name: 'Change' }).click();
    await pickup.getByLabel('Collect them from').selectOption('No pickup point');
    await expect(page.getByText('Pickup point taken off this lesson')).toBeVisible();
    await pickup.getByLabel('Collect them from').selectOption({ label: 'Add an address for Jack Taylor' });
    await expect(page).toHaveURL(/\/app\/instructor\/learners\/[0-9a-f-]{36}\?add=pickup$/);
    await expect(page.getByRole('dialog', { name: 'Add a pickup point' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Put it back where it was, for the rest of the test.
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await tapUntil(page.getByRole('button', { name: 'Open 11:00 with Jack Taylor' }), sheet);
    await sheet
      .getByRole('region', { name: 'Pickup' })
      .getByLabel('Collect them from')
      .selectOption({ label: 'Home, Little London & Woodhouse, Leeds, LS2 9JT' });
    await expect(page.getByText('Collecting them from there')).toBeVisible();

    // And where Jack's lessons start is untouched: the next one still starts at home.
    await removeLesson('Sarah Khan', learner, day, '11:00');
    await bookLesson('Sarah Khan', learner, day, '14:00');
    await page.goto(`/app/instructor/diary?view=day&date=${day}`);
    await tapUntil(page.getByRole('button', { name: 'Open 14:00 with Jack Taylor' }), sheet);
    await expect(sheet.getByRole('region', { name: 'Pickup' })).toContainText('LS2 9JT');
    await removeLesson('Sarah Khan', learner, day, '14:00');
  });

  test('opens from the week too', { tag: '@desktop-only' }, async ({ page }, testInfo) => {
    const day = sunday(testInfo.project.name, 1);
    await clearDiary('Sarah Khan', day);
    await bookLesson('Sarah Khan', learner, day, '12:00');

    await page.goto(`/app/instructor/diary?view=week&date=${day}`);
    const sheet = page.getByRole('dialog', { name: 'Jack Taylor' });
    await tapUntil(page.getByRole('button', { name: 'Open 12:00 with Jack Taylor' }), sheet);
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toBeVisible();
    await removeLesson('Sarah Khan', learner, day, '12:00');
  });

  test('opens from Today', async ({ page }, testInfo) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    // Late, so nothing else on Today is near it, and far enough apart for the buffer between them.
    const hour = testInfo.project.name === 'mobile' ? '20:00' : '22:30';
    await bookLesson('Sarah Khan', learner, today, hour);

    await page.goto('/app/instructor');
    const sheet = page.getByRole('dialog', { name: 'Jack Taylor' });
    await tapUntil(
      page.getByRole('list', { name: "Today's lessons" }).getByRole('button', { name: `Open ${hour} with Jack Taylor` }),
      sheet,
    );
    await expect(sheet.getByRole('link', { name: 'Call' })).toBeVisible();
    await snap(page, testInfo, 'lesson-details-today');
    await removeLesson('Sarah Khan', learner, today, hour);
  });

  test('lists the lessons after today under Today, five at a time, each opening (D-167)', async ({ page }, testInfo) => {
    await page.goto('/app/instructor');
    await expect(page.getByRole('heading', { level: 2, name: 'Upcoming lessons' })).toBeVisible();
    const upcoming = page.getByRole('list', { name: 'Upcoming lessons' });
    // The seed books Sarah a fortnight ahead, so there are always more than ten.
    await expect(upcoming.getByRole('listitem')).toHaveCount(5);
    await page.getByRole('link', { name: 'Show more' }).click();
    await expect(page).toHaveURL(/upcoming=10$/);
    await expect(upcoming.getByRole('listitem')).toHaveCount(10);
    await expectAccessible(page);
    await snap(page, testInfo, 'upcoming-lessons');

    const first = upcoming.getByRole('button').first();
    const learnerName = ((await first.getAttribute('aria-label')) ?? '').replace(/^Open \d{2}:\d{2} with /, '');
    await tapUntil(first, page.getByRole('dialog', { name: learnerName }));
  });
});

