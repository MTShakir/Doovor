import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeTakings, platformFigures, type PlatformFacts } from '../support/database';
import { dayLabel, expectAccessible, snap, tapThrough } from '../support/helpers';

/** The day as the dashboard writes a range: "Sun 20 Sep 2026". */
const dayLabelWithYear = (date: string): string => `${dayLabel(date)} ${date.slice(0, 4)}`;

const wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Money as the app writes it: "£42", "£42.50", "£1,240". */
function money(pence: number): string {
  const rest = pence % 100;
  const pounds = wholePounds.format(Math.trunc(pence / 100));
  return rest === 0 ? pounds : `${pounds}.${String(rest).padStart(2, '0')}`;
}

/** A count as the app writes it: "7", "4,310". */
const count = (n: number): string => new Intl.NumberFormat('en-GB').format(n);

/** The big number on one of the dashboard's figures. */
function figure(page: Page, label: string) {
  return page
    .locator('dl[aria-label="The platform at a glance"] > div')
    .filter({ has: page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }) })
    .locator('dd > span')
    .first();
}

async function expectFigures(page: Page, facts: PlatformFacts): Promise<void> {
  const { signups, businesses, lessons, money: taken, verification, disputes } = facts;
  await expect(figure(page, 'Sign-ups')).toHaveText(count(signups.learners + signups.instructors + signups.schools + signups.undecided));
  await expect(figure(page, 'Active Businesses')).toHaveText(count(businesses.active));
  await expect(figure(page, 'Teaching')).toHaveText(count(businesses.teaching));
  await expect(figure(page, 'Suspended')).toHaveText(count(businesses.suspended));
  await expect(figure(page, 'Lessons booked')).toHaveText(count(lessons.booked));
  await expect(figure(page, 'Lessons completed')).toHaveText(count(lessons.completed));
  await expect(figure(page, 'GMV')).toHaveText(money(taken.gmv_pence));
  await expect(page.getByText(`${money(taken.card_pence)} by card, ${money(taken.refunds_pence)} refunded`)).toBeVisible();
  await expect(figure(page, 'Fees earned')).toHaveText(money(taken.fees_pence));

  const waiting = page.getByRole('region', { name: 'Waiting on a person' });
  const badges = verification.waiting === 0 ? 'No badges to check' : `${count(verification.waiting)} ${verification.waiting === 1 ? 'badge' : 'badges'} to check`;
  const queue = waiting.getByRole('link', { name: new RegExp(`^${badges}`) });
  await expect(queue).toBeVisible();
  if (verification.waiting > 0) await expect(queue).not.toContainText('Every badge sent in has been checked');
  await expect(waiting).toContainText(
    disputes.open === 0 ? 'No disputes open' : `${count(disputes.open)} ${disputes.open === 1 ? 'dispute' : 'disputes'} open`,
  );
}

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('the admin dashboard (ADM-01, M5-17)', { tag: '@desktop-only' }, () => {
  test.use({ storageState: authFile('admin') });

  test('the figures match the data, and a badge waiting is a click from the queue', async ({ page }, testInfo) => {
    const takings = await makeTakings('Dashboard');
    try {
      // Other tests sign people up, book and pay at the same moment, so the page and the database
      // are read again until they describe the same instant.
      await expect(async () => {
        await page.goto('/admin');
        await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
        const seeded = await platformFigures();
        // The dashboard's function agrees with the same things counted plainly.
        expect(seeded.facts.businesses.active).toBe(seeded.activeBusinesses);
        expect(seeded.facts.businesses.suspended).toBe(seeded.suspendedBusinesses);
        expect(seeded.facts.verification.waiting).toBe(seeded.badgesWaiting);
        expect(seeded.facts.disputes.open).toBe(seeded.disputesOpen);
        await expectFigures(page, seeded.facts);
      }).toPass({ timeout: 60_000 });

      // The seed books lessons in these 30 days, and the school made for this test took money in
      // them, so neither is a row of zeros.
      const { facts } = await platformFigures();
      expect(facts.lessons.booked).toBeGreaterThan(0);
      expect(facts.money.gmv_pence).toBeGreaterThanOrEqual(takings.gmvPence);
      expect(facts.money.card_pence).toBeGreaterThanOrEqual(takings.cardPence);
      expect(facts.money.fees_pence).toBeGreaterThanOrEqual(takings.feesPence);
      expect(facts.money.refunds_pence).toBeGreaterThanOrEqual(takings.refundsPence);
      const dates = page.getByRole('region', { name: 'Dates' });
      await expect(dates.getByText(/^\w{3} \d{1,2} \w{3} \d{4} to \w{3} \d{1,2} \w{3} \d{4}$/)).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-dashboard');

      await page.getByRole('region', { name: 'Waiting on a person' }).getByRole('link', { name: /to check/ }).click();
      await expect(page).toHaveURL(/\/admin\/verification$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Verification' })).toBeVisible();
    } finally {
      await takings.remove();
    }
  });

  test('adds the figures up over the days staff choose (D-171)', async ({ page }, testInfo) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const dates = page.getByRole('region', { name: 'Dates' });
    const buttons = dates.getByRole('navigation', { name: 'Dates' });
    await expect(buttons.getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('aria-current', 'page');

    // Today alone: the dates say so, and the figures are read again for that one day.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    await tapThrough(buttons.getByRole('link', { name: 'Today', exact: true }), /\/admin\?range=today$/);
    await expect(buttons.getByRole('link', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(dates).toContainText(dayLabelWithYear(today));

    // A week two years ago, typed by hand: nothing happened then, and the figures say so.
    await dates.getByLabel('From').fill('2024-01-01');
    await dates.getByLabel('To').fill('2024-01-07');
    await dates.getByRole('button', { name: 'Show these days' }).click();
    await expect(page).toHaveURL(/from=2024-01-01&to=2024-01-07/);
    await expect(dates).toContainText('Mon 1 Jan 2024 to Sun 7 Jan 2024');
    await expect(figure(page, 'Sign-ups')).toHaveText('0');
    await expect(figure(page, 'Lessons booked')).toHaveText('0');
    await expect(figure(page, 'GMV')).toHaveText('£0');
    // What is waiting now is not about those days, so it still says what waits.
    await expect(page.getByRole('region', { name: 'Waiting on a person' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-dashboard-dates');
  });

  test('folds away the lists of who stands out, and follows the days chosen (D-172)', async ({ page }, testInfo) => {
    await page.goto('/admin');
    const stands = page.getByRole('region', { name: 'Who stands out' });
    const card = (title: string) => stands.locator('details').filter({ hasText: title });

    // Folded away until opened: the dashboard is a screen of figures first.
    const busiest = card('Schools with the most learners');
    const school = busiest.getByRole('link', { name: /Quayside Driving School/ });
    await expect(school).toBeHidden();
    await busiest.getByText('Schools with the most learners').click();
    await expect(school).toBeVisible();
    await expect(school).toContainText(/\d+ learners?/);

    // The seed's own Businesses joined today, so they are new to the platform.
    const arrivals = card('New to the platform');
    await arrivals.getByText('New to the platform').click();
    await expect(arrivals.getByRole('link').first()).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-highlights');

    // A week in 2024: every list says there was nobody, as the figures say there was nothing.
    await page.goto('/admin?from=2024-01-01&to=2024-01-07');
    await stands.locator('details').filter({ hasText: 'Top earning schools' }).getByText('Top earning schools').click();
    await expect(stands.getByText('No school took a payment in these days.')).toBeVisible();
    await card('New to the platform').getByText('New to the platform').click();
    await expect(stands.getByText('Nobody joined in these days.')).toBeVisible();
  });

  test('support staff see the same dashboard', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('support') });
    const page = await context.newPage();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Waiting on a person' })).toBeVisible();
    await expect(figure(page, 'GMV')).toHaveText(/^£/);
    await context.close();
  });
});
