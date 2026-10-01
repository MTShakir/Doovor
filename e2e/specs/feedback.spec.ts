import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { makeReport, withDatabase } from '../support/database';
import { jpegWithGps } from '../support/images';
import { expectAccessible, pickUntil, settled, snap } from '../support/helpers';

/**
 * Telling us something, and the people who read it (D-202).
 *
 * The form sits beside the account rather than in a portal, so anybody signed in reaches it; it is
 * checked at both widths. The list staff read is a desktop screen like the rest of the admin
 * portal, and each test brings its own report so the two widths never read each other's.
 */
test.describe('telling us something (D-202)', () => {
  test.use({ storageState: authFile('instructor') });

  test('an instructor reports a problem, and is told it has reached us', async ({ page }, testInfo) => {
    // Its own words per width, so the row this test makes is the row this test cleans up.
    const message = `The diary will not scroll on my phone (${testInfo.project.name})`;
    try {
      await page.goto('/feedback');
      await expect(page.getByRole('heading', { level: 1, name: 'Tell us something' })).toBeVisible();

      await pickUntil(
        page.getByLabel('What is this about?'),
        'issue',
        page.getByText('Something that went wrong. Say what you were doing when it did.'),
      );
      await expectAccessible(page);
      await snap(page, testInfo, 'feedback-form');

      // Nothing said is nothing sent.
      await page.getByRole('button', { name: 'Send it' }).click();
      await expect(page.getByText('Tell us what happened')).toBeVisible();

      await page.getByLabel('Tell us about it').fill(message);

      // A screenshot, which goes up as it is chosen and comes back as a thumbnail rather than as
      // the words "Picture 1" (D-241). The tile that stands in while it uploads is the same list.
      const shot = await jpegWithGps(page);
      await page.setInputFiles('input[type="file"]', { name: 'screenshot.jpg', mimeType: 'image/jpeg', buffer: shot });
      const attached = page.getByRole('list', { name: 'Pictures added' });
      await expect(attached.getByRole('img', { name: 'Attachment 1' })).toBeVisible();
      await expect(page.getByText(/^Adding/)).toHaveCount(0);
      await settled(page);
      await snap(page, testInfo, 'feedback-with-picture');

      // Taking it off leaves nothing behind, in the list or in the bucket.
      await attached.getByRole('button', { name: 'Take off picture 1' }).click();
      await expect(page.getByRole('list', { name: 'Pictures added' })).toHaveCount(0);

      // And on again, so the report carries one.
      await page.setInputFiles('input[type="file"]', { name: 'screenshot.jpg', mimeType: 'image/jpeg', buffer: shot });
      await expect(attached.getByRole('img', { name: 'Attachment 1' })).toBeVisible();

      await page.getByRole('button', { name: 'Send it' }).click();
      const sent = page.getByRole('region', { name: 'That has reached us' });
      await expect(sent).toBeVisible();
      await expect(page.getByText('We read every one.')).toBeVisible();

      // The reference, which is the one thing on this card worth writing down (D-241).
      const reference = (await sent.getByText(/^R\d{2,}$/).textContent())?.trim() ?? '';
      expect(reference).toMatch(/^R\d{2,}$/);
      await expect(sent).toContainText('We have emailed this to you as well.');
      await snap(page, testInfo, 'feedback-sent');

      // It is there, with the screen they were on, who sent it, and the reference they were shown.
      const rows = await withDatabase(
        async (sql) => sql<{ id: string; reference: string; kind: string; page: string | null; email: string; pictures: number }[]>`
          select f.id, f.reference, f.kind, f.page, u.email, coalesce(array_length(f.images, 1), 0) as pictures
            from public.feedback_submissions f join public.users u on u.id = f.user_id
           where f.message = ${message}`,
      );
      expect(rows).toEqual([
        {
          id: rows[0]?.id ?? '',
          reference,
          kind: 'issue',
          page: '/feedback',
          email: roles.instructor.email,
          // The one still attached when it was sent, not the one taken off.
          pictures: 1,
        },
      ]);

      // And the confirmation goes out. The job runner is not part of a local run, so the event the
      // database wrote is handed to the same job by hand (M3-18).
      const confirmation = await page.request.post('/dev/events', {
        data: { name: 'feedback.submitted', payload: { feedback_id: rows[0]?.id } },
      });
      expect(await confirmation.json()).toEqual({ sent: true });
    } finally {
      await withDatabase(async (sql) => sql`delete from public.feedback_submissions where message = ${message}`);
    }
  });

  test('a learner reaches it too, which is the point of it not being in a portal', async ({ browser }) => {
    const message = `My instructor cannot see my pickup point (${Date.now().toString(36)})`;
    const context = await browser.newContext({ storageState: authFile('learner') });
    try {
      const page = await context.newPage();
      await page.goto('/feedback');
      await expect(page.getByRole('heading', { level: 1, name: 'Tell us something' })).toBeVisible();
      await page.getByLabel('Tell us about it').fill(message);
      await page.getByRole('button', { name: 'Send it' }).click();
      await expect(page.getByRole('region', { name: 'That has reached us' })).toBeVisible();

      const rows = await withDatabase(
        async (sql) => sql<{ kind: string; email: string }[]>`
          select f.kind, u.email
            from public.feedback_submissions f join public.users u on u.id = f.user_id
           where f.message = ${message}`,
      );
      expect(rows).toEqual([{ kind: 'feedback', email: roles.learner.email }]);
    } finally {
      await context.close();
      await withDatabase(async (sql) => sql`delete from public.feedback_submissions where message = ${message}`);
    }
  });

  test('the support button opens the same form from wherever somebody is (D-241)', async ({ page }, testInfo) => {
    const message = `The learners list is slow today (${testInfo.project.name})`;
    try {
      // Anywhere in a portal, not the feedback page: the point of the button is not having to leave.
      await page.goto('/app/instructor/diary');
      await page.getByRole('button', { name: 'Support' }).click();

      const sheet = page.getByRole('dialog');
      await expect(sheet.getByText('Tell us something')).toBeVisible();
      await expect(sheet.getByText('We read every one.')).toBeVisible();

      await sheet.getByLabel('Tell us about it').fill(message);
      await settled(page);
      await snap(page, testInfo, 'support-sheet');

      await sheet.getByRole('button', { name: 'Send it' }).click();
      const sent = sheet.getByRole('region', { name: 'That has reached us' });
      await expect(sent).toBeVisible();
      await expect(sent.getByText(/^R\d{2,}$/)).toBeVisible();

      // It recorded the screen they were actually on, not the form's own address.
      const rows = await withDatabase(
        async (sql) => sql<{ page: string | null }[]>`
          select page from public.feedback_submissions where message = ${message}`,
      );
      expect(rows).toEqual([{ page: '/app/instructor/diary' }]);
    } finally {
      await withDatabase(async (sql) => sql`delete from public.feedback_submissions where message = ${message}`);
    }
  });

  // The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
  test.describe('what staff do with it', { tag: '@desktop-only' }, () => {
    test.use({ storageState: authFile('admin') });

    test('staff read who sent it and what they were looking at, one kind at a time, and mark it dealt with', async ({ page }, testInfo) => {
      const report = await makeReport('Rosa', 'issue', 'The timer kept running after the lesson ended');
      try {
        await page.goto('/admin/feedback');
        await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();

        const card = page.getByRole('region', { name: report.name });
        await expect(card).toContainText(report.reference);
        await expect(card).toContainText(report.message);
        await expect(card).toContainText('Report a problem');
        await expect(card).toContainText(report.email);
        await expect(card).toContainText('from /app/instructor/diary');
        await expect(card.getByText('Waiting')).toBeVisible();
        await expect(card.getByRole('link', { name: 'Reply' })).toHaveAttribute('href', new RegExp(`^mailto:${report.email}`));
        await expectAccessible(page);
        await snap(page, testInfo, 'admin-feedback');

        // One kind at a time, and the address says which.
        await page.getByRole('navigation', { name: 'What sort of thing' }).getByRole('link', { name: 'Request a feature' }).click();
        await expect(page).toHaveURL(/kind=feature/);
        await expect(page.getByRole('region', { name: report.name })).toHaveCount(0);

        await page.getByRole('navigation', { name: 'What sort of thing' }).getByRole('link', { name: 'Report a problem' }).click();
        await expect(page).toHaveURL(/kind=issue/);

        // Read and dealt with, so the next person knows, and put back if it was not.
        const again = page.getByRole('region', { name: report.name });
        await again.getByRole('button', { name: 'Dealt with' }).click();
        await expect(page.getByText('Marked as dealt with')).toBeVisible();
        await expect(again.getByText('Dealt with', { exact: true })).toBeVisible();

        // Which tells the person who sent it, naming the reference (D-241).
        const told = await page.request.post('/dev/events', {
          data: { name: 'feedback.handled', payload: { feedback_id: report.id } },
        });
        expect(await told.json()).toEqual({ sent: true });

        await again.getByRole('button', { name: 'Put it back' }).click();
        await expect(page.getByText('Put back', { exact: true })).toBeVisible();
        await expect(again.getByText('Waiting')).toBeVisible();
      } finally {
        await report.remove();
      }
    });
  });
});
