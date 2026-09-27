import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * What a plan carries, what is on its way, and how Pro is marked (D-208, D-209).
 *
 * The seeded instructor is on Pro, so the two sides are checked by moving that one Business
 * between plans inside the test and putting it back. Both widths run at once against the same
 * Business, so the plan is only moved in the desktop run and the mobile run reads Pro as seeded.
 */
test.describe('your plan and what is Pro (D-208, D-209)', () => {
  test.use({ storageState: authFile('instructor') });

  test('a Pro instructor sees what they have, what is coming, and can ask for a feature', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Your plan' })).toBeVisible();

    // The founding place is for good, and the day the plan runs to is the thing somebody on a
    // trial cannot otherwise find out (D-203, D-204).
    const card = page.getByRole('region', { name: 'Pro' });
    await expect(card).toContainText('Founding member');
    await expect(card).toContainText('That stays yours for good');
    await expect(card).toContainText(/Free until \w{3} \d{1,2} \w{3} \d{4}/);

    // What is built is ticked. Pro leads with everything the plan below carries.
    const have = page.getByRole('region', { name: 'What you have' });
    await expect(have).toContainText('Everything in Free');
    await expect(have).toContainText('Unlimited learners');
    await expect(have).toContainText('Expenses, mileage and exports ready for Making Tax Digital');

    // What is not built is kept apart from it, and nothing appears in both.
    const coming = page.getByRole('region', { name: 'On the way' });
    await expect(coming).toContainText('Google and Outlook calendar sync');
    await expect(coming).toContainText('AI Assistant');
    // Coming to Free is coming to Pro as well, so a Pro instructor hears about it too (D-212).
    await expect(coming).toContainText('Messages: in-app chat with your learners');
    await expect(have).not.toContainText('AI Assistant');
    await expect(have).not.toContainText('Google and Outlook calendar sync');

    await expect(page.getByRole('link', { name: 'Request a feature' })).toHaveAttribute('href', '/feedback');
    await expectAccessible(page);
    await snap(page, testInfo, 'your-plan');
  });

  test('the More menu leads with the work, marks Pro, and has no notifications row', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/more');
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();

    // The bell is in the header of every screen, so the menu does not carry it too. Scoped to the
    // menu itself: the bell is a link called Notifications as well, and it is meant to be there.
    const menu = page.getByRole('main');
    await expect(menu.getByRole('link', { name: /^Notifications/ })).toHaveCount(0);

    await expect(menu.getByRole('link', { name: 'Messages' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Bookkeeping' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Calendar sync' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Your booking colours' })).toBeVisible();

    // D-216: every row carries a picture beside its label, and a chevron: two drawings per row.
    // Ten lines of grey text is a list somebody reads word by word every time.
    const rows = menu.getByRole('link');
    await expect(menu.locator('a svg')).toHaveCount((await rows.count()) * 2);
    await snap(page, testInfo, 'instructor-more');
  });

  test('a feature that is not built says so and sells nothing', async ({ page }) => {
    await page.goto('/app/instructor/calendar');
    const card = page.getByRole('region', { name: 'Calendar sync is on the way' });
    await expect(card).toContainText('kept up to date when one moves');
    // D-116: nothing here offers a plan on the strength of a screen that does not exist.
    await expect(page.getByRole('link', { name: 'See what Pro includes' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Tell us about it' })).toHaveAttribute('href', '/feedback');
  });

  test('the thing coming to Free says it is coming to everybody (D-212)', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/messages');
    const card = page.getByRole('region', { name: 'Messages is on the way' });
    await expect(card).toContainText('One thread per learner');
    // Not marked Pro, because it is not: it sits between two Pro rows in the menu.
    await expect(card).toContainText('Every plan');
    await expect(card.getByText('Pro', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'See what Pro includes' })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'messages-coming');
  });
});

/** Free carries ten at a time, and says so before anybody is refused (D-208). */
test.describe('what Free carries (D-208)', { tag: '@desktop-only' }, () => {
  test.use({ storageState: authFile('instructor') });

  test('an instructor on Free sees the number, and Pro rows greyed with the tag', async ({ page }, testInfo) => {
    const business = await withDatabase(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        select b.id from public.businesses b
          join public.memberships m on m.business_id = b.id
          join public.users u on u.id = m.user_id
         where u.email = 'sarah.khan@example.com' and m.role = 'owner'`;
      if (!row) throw new Error('The seeded instructor owns no Business');
      await sql`update public.businesses set plan = 'free' where id = ${row.id}`;
      return row.id;
    });

    try {
      await page.goto('/app/instructor/learners');
      const note = page.getByRole('region', { name: /of 10 learners/ });
      await expect(note).toContainText('Free carries 10 at a time');
      await expect(note).toContainText('teaching, waiting or with a test booked');

      await page.goto('/app/instructor/plan');
      await expect(page.getByRole('region', { name: 'What you have' })).toContainText('Up to 10 learners at once');
      await expect(page.getByRole('region', { name: 'What Pro adds' })).toContainText('Unlimited learners');
      await snap(page, testInfo, 'your-plan-free');

      await page.goto('/app/instructor/more');
      // Still there, so somebody on Free can see what they would get.
      await expect(page.getByRole('link', { name: 'Bookkeeping, part of Pro' })).toBeVisible();
      await snap(page, testInfo, 'instructor-more-free');

      await page.goto('/app/instructor/books');
      await expect(page.getByRole('region', { name: 'Bookkeeping is part of Pro' })).toContainText('hand your accountant a year');
      await expect(page.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute('href', '/app/instructor/plan');
      await expectAccessible(page);
    } finally {
      await withDatabase(async (sql) => sql`update public.businesses set plan = 'pro' where id = ${business}`);
    }
  });
});
