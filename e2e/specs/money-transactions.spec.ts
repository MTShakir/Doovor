import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * What the Money screen lists under the figures, and what is still owed back (MNY-01, R-08, D-195).
 *
 * The seed takes no money, so this spec puts its own in and takes it out again at the end. Other
 * specs take payments on this same instructor at the same moment, so nothing here is asserted by
 * position or by a total: the amounts are odd ones nothing else uses, and they are found by name.
 * The two widths run together, so each gets its own amounts and its own refund.
 */
const BUSINESS = 'Sarah Khan Driving';

/** Six payments, so a page of five leaves one over and Load more has something to do. */
function moneyFor(project: string): { amounts: number[]; owed: number; reason: string } {
  const base = project === 'mobile' ? 3100 : 4100;
  return {
    amounts: [11, 22, 33, 44, 55, 66].map((one) => base + one),
    owed: base + 77,
    reason: `Cut short on the ${project} run`,
  };
}

test.describe('the money screen (MNY-01, R-08, D-195)', () => {
  test.use({ storageState: authFile('instructor') });
  test.describe.configure({ mode: 'serial' });

  // Playwright wants the fixtures destructured even when a hook uses none of them, and the
  // width this run is for is only on the second argument.
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, workerInfo) => {
    const { amounts, owed, reason } = moneyFor(workerInfo.project.name);
    await withDatabase(async (sql) => {
      // One learner of this instructor's, then one payment per amount: a join across every
      // learner would give six payments to whichever one the database happened to read first.
      await sql`
        with somebody as (
          select b.id as business_id, r.learner_id
            from public.businesses b
            join public.instructor_profiles i on i.business_id = b.id
            join public.learner_relationships r on r.instructor_id = i.id
           where b.name = ${BUSINESS}
           limit 1
        )
        insert into public.payments (business_id, learner_id, provider, amount_pence, method, status, paid_at)
        select s.business_id, s.learner_id, 'offline', money.amount, 'cash', 'paid',
               now() - (money.ordinality || ' hours')::interval
          from somebody s
          cross join unnest(${amounts}::integer[]) with ordinality as money(amount, ordinality)`;
      await sql`
        insert into public.refunds (business_id, learner_id, kind, provider, amount_pence, reason, status, created_at)
        select b.id, r.learner_id, 'offline', 'offline', ${owed}, ${reason}, 'pending', now() - interval '2 days'
          from public.businesses b
          join public.instructor_profiles i on i.business_id = b.id
          join public.learner_relationships r on r.instructor_id = i.id
         where b.name = ${BUSINESS}
         limit 1`;
    });
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterAll(async ({}, workerInfo) => {
    const { amounts, reason } = moneyFor(workerInfo.project.name);
    await withDatabase(async (sql) => {
      await sql`delete from public.refunds where reason = ${reason}`;
      await sql`delete from public.payments where amount_pence = any(${amounts}::integer[])`;
    });
  });

  test('lists the money itself, five at a time', async ({ page }, testInfo) => {
    const { amounts } = moneyFor(testInfo.project.name);
    await page.goto('/app/instructor/money');
    const transactions = page.getByRole('region', { name: 'Recent transactions' });
    const rows = transactions.getByRole('listitem');
    await expect(rows).toHaveCount(5);

    await transactions.getByRole('link', { name: 'Load more' }).click();
    await expect(page).toHaveURL(/show=10/);
    // How many more depends on what other specs have taken by now, but there are more.
    await expect(rows.nth(5)).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'money-transactions');

    // All six, asked for in one go, each saying who paid it and how.
    await page.goto('/app/instructor/money?show=50');
    for (const amount of amounts) {
      const row = rows.filter({ hasText: `£${(amount / 100).toFixed(2)}` }).first();
      await expect(row).toContainText('Cash');
    }
  });

  test('offers what is owed back above the figures, and hands it over', async ({ page }, testInfo) => {
    const { owed, reason } = moneyFor(testInfo.project.name);
    const amount = `£${(owed / 100).toFixed(2)}`;
    await page.goto('/app/instructor/money');
    await page.getByRole('link', { name: /Pending refunds/ }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Pending refunds' })).toBeVisible();
    const owing = page.getByRole('listitem').filter({ hasText: reason });
    await expect(owing).toContainText(amount);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'pending-refunds');

    await owing.getByRole('button', { name: 'Mark handed back' }).click();
    await page.getByRole('button', { name: 'It is handed back' }).click();
    await expect(owing).toHaveCount(0);
  });
});

/** PAY-01, PAY-03, PAY-08, D-195: setting up payments, which is a setting and lives under More. */
test.describe('payment setup (PAY-01, PAY-03, PAY-08, D-195)', () => {
  test.use({ storageState: authFile('instructor') });

  test('is reached from More, and is where card payments are switched on', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/more');
    await page.getByRole('link', { name: 'Payment setup' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Payment setup' })).toBeVisible();

    // The boxes that used to sit under the figures on the Money screen.
    await expect(page.getByRole('region', { name: 'Online payments' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Receipts' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Accept online payments' })).toBeVisible();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'payment-setup');

    // And they are no longer on the Money screen.
    await page.goto('/app/instructor/money');
    await expect(page.getByRole('region', { name: 'Receipts' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Card payments' })).toHaveCount(0);
  });
});
