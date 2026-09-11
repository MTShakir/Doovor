import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { signInThroughForm } from '../support/sign-in';

test.describe('signed-out visitors (proxy.ts)', () => {
  test('are sent to sign in and brought back afterwards', async ({ page }) => {
    await page.goto('/app/instructor/diary');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Finstructor%2Fdiary/);
    await signInThroughForm(page, roles.instructor.email, { next: '/app/instructor/diary' });
    await expect(page).toHaveURL(/\/app\/instructor\/diary$/);
  });

  for (const path of ['/admin', '/account', '/app/learner', '/mfa', '/verify-phone']) {
    test(`cannot open ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in\?next=/);
    });
  }
});

test.describe('people stay in their own portal (PRD 6.2)', () => {
  test.describe('learner', () => {
    test.use({ storageState: authFile('learner') });
    test('is sent home from the school portal', async ({ page }) => {
      await page.goto('/app/school');
      await expect(page).toHaveURL(/\/app\/learner$/);
    });
  });

  test.describe('school instructor', () => {
    test.use({ storageState: authFile('schoolInstructor') });
    test('cannot open the school portal', async ({ page }) => {
      await page.goto('/app/school');
      await expect(page).toHaveURL(/\/app\/instructor$/);
    });
  });

  test.describe('school manager', () => {
    test.use({ storageState: authFile('schoolManager') });
    test('cannot open the admin portal', async ({ page }) => {
      await page.goto('/admin/businesses');
      await expect(page).toHaveURL(/\/app\/school$/);
    });
  });

  test.describe('independent instructor', () => {
    test.use({ storageState: authFile('instructor') });
    test('choosing a role again goes straight to their portal', async ({ page }) => {
      await page.goto('/start');
      await expect(page).toHaveURL(/\/app\/instructor$/);
    });
  });
});
