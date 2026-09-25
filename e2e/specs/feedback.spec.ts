import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { makeReport, withDatabase } from '../support/database';
import { expectAccessible, pickUntil, snap } from '../support/helpers';

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
      await page.getByRole('button', { name: 'Send it' }).click();
      await expect(page.getByRole('region', { name: 'That has reached us' })).toBeVisible();
      await expect(page.getByText('We read every one.')).toBeVisible();
      await snap(page, testInfo, 'feedback-sent');

      // It is there, with the screen they were on and who sent it.
      const rows = await withDatabase(
        async (sql) => sql<{ kind: string; page: string | null; email: string }[]>`
          select f.kind, f.page, u.email
            from public.feedback_submissions f join public.users u on u.id = f.user_id
           where f.message = ${message}`,
      );
      expect(rows).toEqual([{ kind: 'issue', page: '/feedback', email: roles.instructor.email }]);
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

  // The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
  test.describe('what staff do with it', { tag: '@desktop-only' }, () => {
    test.use({ storageState: authFile('admin') });

    test('staff read who sent it and what they were looking at, one kind at a time, and mark it dealt with', async ({ page }, testInfo) => {
      const report = await makeReport('Rosa', 'issue', 'The timer kept running after the lesson ended');
      try {
        await page.goto('/admin/feedback');
        await expect(page.getByRole('heading', { level: 1, name: 'Feedback' })).toBeVisible();

        const card = page.getByRole('region', { name: report.name });
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

        await again.getByRole('button', { name: 'Put it back' }).click();
        await expect(page.getByText('Put back', { exact: true })).toBeVisible();
        await expect(again.getByText('Waiting')).toBeVisible();
      } finally {
        await report.remove();
      }
    });
  });
});

/**
 * What a Business is on, and until when (D-203, D-204). The trial is the reason this screen
 * exists: somebody given ninety days has no other way to find out when they end.
 */
test.describe('your plan (D-203, D-204)', () => {
  test.use({ storageState: authFile('instructor') });

  test('an instructor reads their plan, their founding place and the day it runs to', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Your plan' })).toBeVisible();

    const card = page.getByRole('region', { name: 'Pro' });
    await expect(card).toContainText('Founding member');
    await expect(card).toContainText('That stays yours for good');
    await expect(card).toContainText(/Free until \w{3} \d{1,2} \w{3} \d{4}/);
    await expect(page.getByRole('region', { name: 'What you have' })).toContainText('Bookkeeping');
    await expectAccessible(page);
    await snap(page, testInfo, 'your-plan');
  });
});
