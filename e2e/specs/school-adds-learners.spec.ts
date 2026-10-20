import { expect, test } from '@playwright/test';
import { makeSchool, withDatabase } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * The school's office adds a learner it already teaches, with one of its instructors, and imports
 * two more from a spreadsheet with nobody yet (M9-27, LRN-01, D-294). Each width has a school of
 * its own, and the accounts made for its learners go with it.
 */
test.describe('the school adds its own learners (LRN-01, D-294)', () => {
  test('by hand with an instructor, and from a spreadsheet with nobody yet', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const label = `Adds ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const key = `${testInfo.project.name}.${school.businessId.slice(0, 8)}`;
    const nell = `Nell ${label}`;
    const ned = `Ned ${label}`;
    const nora = `Nora ${label}`;

    try {
      await signInThroughForm(page, school.managerEmail, { next: '/app/school/learners' });
      await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('No learners yet')).toBeVisible();

      // By hand, with the school's instructor.
      const sheet = page.getByRole('dialog', { name: 'Add a learner' });
      await tapUntil(page.getByRole('button', { name: 'Add a learner' }), sheet);
      await sheet.getByLabel('Their name').fill(nell);
      await sheet.getByLabel('Their email').fill(`nell.${key}@example.com`);
      await sheet.getByLabel('Their postcode').fill('m1 1ae');
      await sheet.getByLabel('Which gearbox?').selectOption('automatic');
      await sheet.getByLabel('Who teaches them?').selectOption({ label: school.instructor.name });
      await expectAccessible(page);
      await snap(page, testInfo, 'school-add-learner');
      await sheet.getByRole('button', { name: 'Add them' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.locator('article').filter({ hasText: nell })).toContainText(`With ${school.instructor.name}`);

      // From a spreadsheet, each given an instructor afterwards.
      await tapUntil(page.getByRole('button', { name: 'Add a learner' }), sheet);
      await sheet.getByRole('link', { name: 'Import a spreadsheet' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Import learners' })).toBeVisible();
      const csv = ['Name,Email', `${ned},ned.${key}@example.com`, `${nora},nora.${key}@example.com`].join('\n');
      // Choosing a file before the page is interactive does nothing at all (D-043).
      await expect(async () => {
        await page
          .getByLabel('Spreadsheet')
          .setInputFiles({ name: 'learners.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
        await expect(page.getByText('Which column is which?')).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByText('2 learners are ready')).toBeVisible();
      await expectAccessible(page);
      await page.getByRole('button', { name: 'Import 2 learners' }).click();
      await expect(page.getByRole('heading', { name: '2 learners imported' })).toBeVisible({ timeout: 30_000 });
      await snap(page, testInfo, 'school-import-learners');

      await page.getByRole('link', { name: 'See your learners' }).click();
      await expect(page).toHaveURL(/\/app\/school\/learners$/);
      // Not still open from before the spreadsheet: the list keeps its state between visits.
      await expect(sheet).toBeHidden();
      for (const name of [ned, nora]) {
        await expect(page.locator('article').filter({ hasText: name })).toContainText('Nobody yet');
      }
      await snap(page, testInfo, 'school-learners-added');
    } finally {
      // The accounts made for its learners, which the school's removal leaves behind.
      const learners = await withDatabase(async (sql) => {
        const rows = await sql<{ id: string }[]>`
          select learner_id as id from public.learner_relationships where business_id = ${school.businessId}`;
        await sql`delete from public.learner_relationships where business_id = ${school.businessId}`;
        return rows.map((row) => row.id);
      });
      await school.remove();
      if (learners.length > 0) {
        await withDatabase(async (sql) => {
          await sql`delete from public.learner_profiles where user_id = any(${learners}::uuid[])`;
          await sql`delete from auth.users where id = any(${learners}::uuid[])`;
        });
      }
    }
  });
});
