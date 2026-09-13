import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/** Importing a book of business (LRN-03, M2-09). */
test.describe('importing learners (LRN-03, M2-09)', () => {
  test.use({ storageState: authFile('instructor') });

  test('reads a spreadsheet, says what it will do, and reports what it did', async ({ page }, testInfo) => {
    // Real accounts are made, so every number in the file belongs to this run alone.
    const stamp = Number(String(Date.now()).slice(-5));
    const number = (at: number) => `07700 ${String(stamp + at).padStart(6, '9')}`.slice(0, 12);
    const first = `Asha ${String(stamp)}`;
    const second = `Ben ${String(stamp)}`;

    const csv = [
      'Pupil name,Mobile number,Email address,Post code',
      `${first},${number(0)},,LS2 9JT`,
      `"${second}",${number(1)},ben${String(stamp)}@example.com,LS6 3QS`,
      'Nobody Atall,,,LS1 4DY',
      `Asha again,${number(0)},,LS2 9JT`,
    ].join('\n');

    await page.goto('/app/instructor/learners/import');
    await expect(page.getByRole('heading', { level: 1, name: 'Import your learners' })).toBeVisible();

    // Choosing a file before the page is interactive does nothing at all (D-043).
    await expect(async () => {
      await page
        .getByLabel('Spreadsheet')
        .setInputFiles({ name: 'learners.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
      await expect(page.getByText('Which column is which?')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // The header names the columns, so the mapping is already right.
    await expect(page.getByLabel('Name')).toHaveValue('0');
    await expect(page.getByLabel('Mobile number')).toHaveValue('1');
    await expect(page.getByLabel('Email')).toHaveValue('2');
    await expect(page.getByLabel('Postcode')).toHaveValue('3');

    await expect(page.getByText('2 learners are ready')).toBeVisible();
    await expect(page.getByText('Line 4 (Nobody Atall): Add an email address or a mobile number')).toBeVisible();
    await expect(page.getByText('Line 5 (Asha again): Same details as line 2')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-import');

    await page.getByRole('button', { name: 'Import 2 learners' }).click();
    await expect(page.getByRole('heading', { name: '2 learners imported' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('2 rows were left out')).toBeVisible();
    await snap(page, testInfo, 'learner-import-done');

    await page.getByRole('link', { name: 'See your learners' }).click();
    await expect(page.getByRole('link', { name: first, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: second, exact: true })).toBeVisible();
  });

  test('says so when the file is not a list of learners', async ({ page }) => {
    await page.goto('/app/instructor/learners/import');
    await expect(async () => {
      await page
        .getByLabel('Spreadsheet')
        .setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('\n\n', 'utf8') });
      await expect(page.getByText('That file has no rows in it.')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });
});
