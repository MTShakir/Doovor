import { brand } from '@repo/config/brand';
import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeSchool, recordAuditTrail } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/** A London day, however the machine running the tests is set. */
const londonDay = (inDays: number): string => {
  const day = new Date();
  day.setDate(day.getDate() + inDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
};

/** The entries on the page: each row's what happened, as its header cell says it. */
async function whatHappened(page: Page): Promise<string[]> {
  return page
    .getByRole('table', { name: 'The audit log, newest first' })
    .locator('tbody th')
    .evaluateAll((cells) => cells.map((cell) => cell.querySelector('span')?.textContent ?? ''));
}

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('the audit log (ADM-07, NFR-SEC-06, M5-22)', { tag: '@desktop-only' }, () => {
  test('every NFR-SEC-06 action type visible: staff find what happened, who did it and to whom, by kind, person, Business and day, a page at a time', async ({ browser }, testInfo) => {
    const school = await makeSchool('Ledger');
    await recordAuditTrail(school, 55);
    const admin = await browser.newContext({ storageState: authFile('admin') });
    try {
      const page = await admin.newPage();
      await page.goto('/admin/audit-log');
      await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

      // Everything done by the instructor, or about them, found by their email in the form.
      const filters = page.getByRole('search', { name: 'Audit log' });
      await filters.getByLabel('Person').fill(school.instructor.email);
      await filters.getByRole('button', { name: 'Show' }).click();
      await expect(page).toHaveURL(new RegExp(`person=${encodeURIComponent(school.instructor.email).replace(/\./g, '\\.')}`));
      await expect.poll(async () => (await whatHappened(page)).sort()).toEqual(
        [
          'Account deletion asked for',
          'Badge approved or refused',
          'Joined a Business',
          'Personal data exported',
          'Role or standing at a Business changed',
          'Signed in',
          'Staff started viewing as them',
        ].sort(),
      );
      const viewing = page.getByRole('row').filter({ hasText: 'Staff started viewing as them' });
      await expect(viewing).toContainText('Priya Support');
      await expect(viewing).toContainText('Support admin');
      await expect(viewing).toContainText(school.instructor.name);
      await viewing.getByText('What changed').click();
      await expect(viewing).toContainText('Cannot see her diary');
      await expect(page.getByRole('row').filter({ hasText: 'Badge approved or refused' })).toContainText('Super admin');
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-audit-log');

      // Each kind NFR-SEC-06 names, by itself, at the school or about its instructor.
      const person = `person=${encodeURIComponent(school.instructor.email)}`;
      const business = `business=${encodeURIComponent(school.name)}`;
      const kinds: [string, string, string[]][] = [
        ['Sign-ins', person, ['Signed in']],
        // Joining the school is a change of role too.
        ['Role changes', person, ['Joined a Business', 'Role or standing at a Business changed']],
        ['Verification decisions', business, ['Badge approved or refused']],
        ['Refunds', business, ['Refund issued']],
        ['Payout and payment changes', business, ['Payments account connected']],
        ['Data exports', person, ['Personal data exported']],
        ['Account deletions', person, ['Account deletion asked for']],
        ['Viewing as somebody', person, ['Staff started viewing as them']],
      ];
      for (const [kind, where, what] of kinds) {
        await page.goto(`/admin/audit-log?${where}`);
        await page.getByRole('search', { name: 'Audit log' }).getByLabel('Kind').selectOption({ label: kind });
        await page.getByRole('search', { name: 'Audit log' }).getByRole('button', { name: 'Show' }).click();
        await expect(page).toHaveURL(/kind=/);
        await expect.poll(async () => (await whatHappened(page)).sort(), { message: kind }).toEqual(what);
      }

      // Nothing has happened tomorrow.
      await page.goto(`/admin/audit-log?business=${encodeURIComponent(school.name)}&from=${londonDay(1)}`);
      await expect(page.getByText('Nothing in the audit log matches these filters.')).toBeVisible();
      await page.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page).toHaveURL(/\/admin\/audit-log$/);

      // The manager's 55 sign-ins, 50 to a page, and back.
      await page.goto(`/admin/audit-log?kind=sign_in&person=${encodeURIComponent(school.managerEmail)}`);
      await expect.poll(async () => (await whatHappened(page)).length).toBe(50);
      await page.getByRole('navigation', { name: 'Audit log pages' }).getByRole('link', { name: 'Older entries' }).click();
      await expect(page).toHaveURL(/before=/);
      await expect.poll(async () => (await whatHappened(page)).length).toBe(5);
      await expect(page.getByRole('link', { name: 'Older entries' })).toHaveCount(0);
      await expectAccessible(page);
      await page.getByRole('link', { name: 'Newest entries' }).click();
      await expect.poll(async () => (await whatHappened(page)).length).toBe(50);
    } finally {
      await admin.close();
    }

    // Support staff read it too.
    const support = await browser.newContext({ storageState: authFile('support') });
    try {
      const page = await support.newPage();
      await page.goto(`/admin/audit-log?kind=viewing&person=${encodeURIComponent(school.instructor.email)}`);
      await expect.poll(() => whatHappened(page)).toEqual(['Staff started viewing as them']);
    } finally {
      await support.close();
      await school.remove();
    }
  });

  test('staff take the log away as a file for the days they chose, and that is written down too (D-173)', async ({ browser }) => {
    const school = await makeSchool('Download');
    await recordAuditTrail(school, 3);
    const admin = await browser.newContext({ storageState: authFile('admin') });
    try {
      const page = await admin.newPage();
      const asked = new URLSearchParams({ business: school.name }).toString();
      await page.goto(`/admin/audit-log?${asked}`);
      const download = page.getByRole('link', { name: 'Download as JSON' });
      await expect(download).toHaveAttribute('href', `/admin/audit-log/log.json?${asked}`);

      // Asked for the way the browser asks, so the file is what a member of staff would get.
      const file = await page.request.get(`/admin/audit-log/log.json?${asked}`);
      expect(file.status()).toBe(200);
      const named = new RegExp(String.raw`^attachment; filename="${brand.shortName.toLowerCase()}-audit-log-\d{4}-\d{2}-\d{2}\.json"$`);
      expect(file.headers()['content-disposition']).toMatch(named);
      const held = (await file.json()) as {
        asked_for: { business: string | null; kind: string | null };
        entries_shown: number;
        more_than_shown: boolean;
        entries: { action: string; business: string | null }[];
      };
      expect(held.asked_for.business).toBe(school.name);
      expect(held.more_than_shown).toBe(false);
      expect(held.entries_shown).toBe(held.entries.length);
      expect(held.entries.length).toBeGreaterThan(0);
      expect(new Set(held.entries.map((entry) => entry.business))).toEqual(new Set([school.name]));

      // Taking the copy is itself an entry, where reading a page is not (D-130).
      await page.goto('/admin/audit-log?kind=export');
      await expect.poll(async () => whatHappened(page)).toContain('Audit log downloaded');
    } finally {
      await admin.close();
      await school.remove();
    }
  });
});
