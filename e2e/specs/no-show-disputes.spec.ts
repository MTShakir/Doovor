import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { bookLesson, lessonEvents, lessonIdAt, notificationChannels, userIdOf } from '../support/database';
import { dayLabel, expectAccessible, settled, snap, tapUntil } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * Disputing a no-show, and deciding it (R-09, M3-19).
 *
 * Sarah Khan runs her own Business, so she marks the no-show and decides the dispute. Olivia
 * Brown is her learner, and nothing else reads her inbox. A morning some days back for each width,
 * before the seed's first lesson, and away from the day the booking tests clear.
 */
test.describe('disputing a no-show (R-09, M3-19)', () => {
  const learner = { email: 'olivia.brown@example.com', name: 'Olivia Brown' };

  // Two days apart and an hour of their own, so a run that crosses midnight between the two
  // widths still gives each a lesson, and a notification, that the other cannot mistake for its own.
  const pastDay = (project: string): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(
      new Date(Date.now() - (project === 'mobile' ? 2 : 4) * 24 * 3_600_000),
    );

  test('the learner disputes a no-show within the week, and the owner waives the fee', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    const day = pastDay(testInfo.project.name);
    const hour = testInfo.project.name === 'mobile' ? '06:00' : '05:00';
    await bookLesson('Sarah Khan', learner.email, day, hour);
    const bookingId = await lessonIdAt('Sarah Khan', day, hour);

    // Sarah marks it, once her diary is listening.
    const sarah = await browser.newContext({ storageState: authFile('instructor') });
    const diary = await sarah.newPage();
    await diary.goto(`/app/instructor/diary?view=day&date=${day}`);
    const lesson = diary.getByRole('article', { name: `${hour} ${learner.name}` });
    await expect(lesson.getByRole('button', { name: 'No show' })).toBeVisible();
    await expect(diary.locator('[data-diary-live="on"]')).toBeAttached();
    await lesson.getByRole('button', { name: 'No show' }).click();
    await expect(diary.getByText('Marked as no show')).toBeVisible();

    // Olivia says it was wrong, from her own lessons.
    await signInThroughForm(page, learner.email, { next: '/app/learner/lessons' });
    const missed = page.getByRole('article').filter({ hasText: `${dayLabel(day)} at ${hour}` });
    await expect(missed).toContainText('Marked as a no-show. If that is wrong, you can dispute it until');
    const sheet = page.getByRole('dialog', { name: 'Dispute this no-show?' });
    await tapUntil(missed.getByRole('button', { name: 'Dispute' }), sheet);
    await expect(sheet.getByRole('button', { name: 'Send dispute' })).toBeDisabled();
    await sheet.getByLabel('What happened?').fill('I was waiting at the corner from ten to six');
    await expectAccessible(page);
    await snap(page, testInfo, 'no-show-dispute');
    await sheet.getByRole('button', { name: 'Send dispute' }).click();
    await expect(page.getByText('Dispute sent')).toBeVisible();
    await expect(missed).toContainText('You disputed this no-show. You will be told what is decided.');
    await expect(missed.getByRole('button', { name: 'Dispute' })).toHaveCount(0);

    // Sarah is told, and goes where it is decided.
    const [disputed] = await lessonEvents(bookingId, 'booking.disputed');
    expect(disputed, 'the dispute was sent to the job that tells people').toBeDefined();
    expect((await diary.request.post('/dev/events', { data: disputed })).status()).toBe(200);
    expect(await notificationChannels(roles.instructor.email, 'booking.disputed', bookingId)).toContain('email');

    await diary.goto(`/app/instructor/learners/${await userIdOf(learner.email)}`);
    const money = diary.getByRole('region', { name: 'Money' });
    const owed = money.getByRole('list', { name: 'Lessons owed for' }).getByRole('listitem').filter({ hasText: `${dayLabel(day)} at ${hour}` });
    await expect(owed).toContainText('No-show fee');
    const dispute = money
      .getByRole('list', { name: 'No-show disputes' })
      .getByRole('listitem')
      .filter({ hasText: `No-show on ${dayLabel(day)} at ${hour}` });
    await expect(dispute).toContainText(`${learner.name} says: I was waiting at the corner from ten to six`);
    await expect(dispute).toContainText('Disputed');

    const decide = diary.getByRole('dialog', { name: `Waive ${learner.name}'s fee?` });
    await tapUntil(dispute.getByRole('button', { name: 'Waive the fee' }), decide);
    await decide.getByLabel(`A note for ${learner.name}`).fill('Sorry, I was at the other corner');
    await expectAccessible(diary);
    await snap(diary, testInfo, 'no-show-waive');
    await decide.getByRole('button', { name: 'Waive the fee' }).click();
    await expect(diary.getByText('Fee waived', { exact: true }).first()).toBeVisible();
    await expect(dispute).toContainText('Fee waived');
    await expect(dispute.getByRole('button', { name: 'Waive the fee' })).toHaveCount(0);
    await expect(owed).toHaveCount(0);
    await sarah.close();

    // Olivia is told, and sees it with the lesson.
    const [decided] = await lessonEvents(bookingId, 'booking.dispute_decided');
    expect((await page.request.post('/dev/events', { data: decided })).status()).toBe(200);
    await page.goto('/notifications');
    await expect(
      page.getByRole('article').filter({ hasText: 'Your no-show dispute was answered' }).filter({ hasText: `${dayLabel(day)} at ${hour}` }),
    ).toContainText('The £42 fee is waived, so nothing is owed.');

    await page.goto('/app/learner/lessons');
    await expect(missed).toContainText('You disputed this no-show, and the fee was waived.');
    await expect(missed).toContainText('Their note: Sorry, I was at the other corner');
    await settled(page);
    await snap(page, testInfo, 'no-show-dispute-answered');
  });
});
