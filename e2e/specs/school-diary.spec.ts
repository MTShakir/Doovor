import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/** The school diary (DIA-09, M1-22). The seeded school has three instructors. */
test.describe('school diary (DIA-09, M1-22)', () => {
  test.use({ storageState: authFile('schoolManager') });

  test('shows every instructor at the school side by side', async ({ page }, testInfo) => {
    await page.goto('/app/school/diary?date=2026-09-15');
    await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();

    // The definition of done: a manager sees all of them, not only their own.
    for (const name of ['Emma Clarke', 'Tom Walsh', 'Aisha Rahman']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expectAccessible(page);
    await snap(page, testInfo, 'school-diary');
  });

  test('narrows to one instructor, and to one kind of car', async ({ page }) => {
    await page.goto('/app/school/diary?date=2026-09-15');

    await page.getByLabel('Transmission').selectOption('automatic');
    await expect(page).toHaveURL(/transmission=automatic/);
    await expect(page.getByRole('heading', { level: 2, name: 'Emma Clarke' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Tom Walsh' })).toBeHidden();

    await page.getByLabel('Transmission').selectOption('');
    await page.getByLabel('Instructor').selectOption({ label: 'Tom Walsh' });
    await expect(page.getByRole('heading', { level: 2, name: 'Tom Walsh' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Emma Clarke' })).toBeHidden();
  });

  test('an instructor at the school sees only their own diary', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('schoolInstructor') });
    const page = await context.newPage();

    // The school diary is not theirs to open: the gate sends them to their own portal.
    await page.goto('/app/school/diary?date=2026-09-15');
    await expect(page).toHaveURL(/\/app\/instructor$/);
    await context.close();
  });
});
