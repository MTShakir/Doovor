import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { seededSchoolFigures, type SeededSchoolFigures } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

const school = 'Quayside Driving School';

const wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Money as the app writes it: "£42", "£42.50", "£1,240". */
function money(pence: number): string {
  const abs = Math.abs(pence);
  const rest = abs % 100;
  const text = rest === 0 ? wholePounds.format(Math.trunc(abs / 100)) : `${wholePounds.format(Math.trunc(abs / 100))}.${String(rest).padStart(2, '0')}`;
  return pence < 0 ? `-${text}` : text;
}

function percent(booked: number, open: number): string {
  return open <= 0 ? 'None open' : `${String(Math.round((booked / open) * 100))}%`;
}

/** The big number on one of the overview's figures. */
function figure(page: Page, label: string | RegExp) {
  return page
    .locator('dl[aria-label="The school at a glance"] > div')
    .filter({ has: page.getByRole('term').filter({ hasText: label }) })
    .locator('dd > span')
    .first();
}

async function expectFigures(page: Page, seeded: SeededSchoolFigures, options: { revenue: boolean }): Promise<void> {
  const { facts } = seeded;
  // The function and a plain count by London's calendar agree, and the page shows them.
  expect(facts.lessons.today).toBe(seeded.lessonsToday);
  expect(facts.lessons.this_week).toBe(seeded.lessonsThisWeek);
  expect(facts.new_learners_month).toBe(seeded.newLearnersThisMonth);

  await expect(figure(page, 'Lessons today')).toHaveText(String(facts.lessons.today));
  await expect(figure(page, 'Lessons this week')).toHaveText(String(facts.lessons.this_week));
  await expect(figure(page, 'Unpaid')).toHaveText(money(facts.unpaid.total_pence));
  await expect(figure(page, 'Utilisation')).toHaveText(percent(facts.utilisation.booked_minutes, facts.utilisation.open_minutes));
  await expect(figure(page, 'New learners')).toHaveText(String(facts.new_learners_month));
  if (options.revenue) {
    await expect(figure(page, /^Revenue in /)).toHaveText(money(facts.revenue_month.total_pence));
  } else {
    await expect(page.getByRole('term').filter({ hasText: /^Revenue in / })).toHaveCount(0);
  }

  const weeks = page.getByRole('region', { name: 'Instructors this week' });
  expect(facts.utilisation.instructors.length).toBeGreaterThan(0);
  await expect(weeks.getByRole('listitem')).toHaveCount(facts.utilisation.instructors.length);
  for (const one of facts.utilisation.instructors) {
    const row = weeks.getByRole('listitem').filter({ hasText: one.name });
    await expect(row).toContainText(percent(one.booked_minutes, one.open_minutes));
    await expect(row.getByRole('progressbar')).toBeVisible();
  }
}

test.describe('school overview (SCH-01, M5-12)', () => {
  test('the owner sees the seeded school as the database counts it', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();

    // Other tests book and take payments at this school at the same moment, so the page and the
    // database are read again until they describe the same instant.
    await expect(async () => {
      await page.goto('/app/school');
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      await expectFigures(page, await seededSchoolFigures(school), { revenue: true });
    }).toPass({ timeout: 60_000 });

    expect((await seededSchoolFigures(school)).facts.lessons.this_week).toBeGreaterThan(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'school-overview-owner');
    await context.close();
  });

  test('a manager sees the same figures, without the revenue (PRD 6.2)', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolManager') });
    const page = await context.newPage();

    await expect(async () => {
      await page.goto('/app/school');
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      await expectFigures(page, await seededSchoolFigures(school), { revenue: false });
    }).toPass({ timeout: 60_000 });

    await expectAccessible(page);
    await snap(page, testInfo, 'school-overview-manager');
    await context.close();
  });
});
