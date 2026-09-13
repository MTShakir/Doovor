import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/** A school moves a learner between its instructors (LRN-06, M2-10). */
test.describe('the school learner list (LRN-06, M2-10)', () => {
  test.describe('a manager', () => {
    test.use({ storageState: authFile('schoolManager') });

    test('sees everybody the school teaches, and who has them', async ({ page }, testInfo) => {
      await page.goto('/app/school/learners');
      await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();

      // Learners of three instructors, on one list.
      const amelia = page.locator('article').filter({ hasText: 'Amelia Evans' });
      await expect(amelia.getByText('With Emma Clarke')).toBeVisible();
      await expect(page.getByText('Harry Thomas')).toBeVisible();
      // Nobody from the independent instructor down the road.
      await expect(page.getByText('Jack Taylor')).toBeHidden();

      await expectAccessible(page);
      await snap(page, testInfo, 'school-learners');
    });

    // One seeded school, two widths: only one of them hands anybody over.
    test('hands a learner to another instructor, and the card remembers', {
      tag: '@desktop-only',
    }, async ({ page }, testInfo) => {
      await page.goto('/app/school/learners');
      const row = page.locator('article').filter({ hasText: 'Isla Roberts' });
      await expect(row.getByText('With Emma Clarke')).toBeVisible();

      await tapUntil(row.getByRole('button', { name: 'Assign' }), page.getByRole('dialog', { name: /Who teaches Isla/ }));
      await expectAccessible(page);
      await snap(page, testInfo, 'school-assign', { fullPage: false });

      await page.getByRole('button', { name: 'Tom Walsh' }).click();
      await expect(page.getByRole('dialog', { name: /Who teaches Isla/ })).toBeHidden();
      await expect(row.getByText('With Tom Walsh')).toBeVisible();

      // Put her back, so the next run finds the school as it was.
      await tapUntil(row.getByRole('button', { name: 'Assign' }), page.getByRole('dialog', { name: /Who teaches Isla/ }));
      await page.getByRole('button', { name: 'Emma Clarke' }).click();
      await expect(row.getByText('With Emma Clarke')).toBeVisible();
    });
  });

  test.describe('the instructor who has them', () => {
    test.use({ storageState: authFile('schoolInstructor') });

    test('reads the history on the learner card @desktop-only', async ({ page }) => {
      await page.goto('/app/instructor/learners');
      await page.getByRole('link', { name: 'Amelia Evans', exact: true }).click();

      const history = page.getByRole('region', { name: 'History' });
      await expect(history.getByText(/Added by|Imported by/)).toBeVisible();
    });

    test('cannot open the school list at all', async ({ page }) => {
      await page.goto('/app/school/learners');
      await expect(page).toHaveURL(/\/app\/instructor$/);
    });
  });
});
