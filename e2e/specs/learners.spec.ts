import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/** The list an instructor works from (LRN-01, M2-04). */
test.describe('the learner list (LRN-01, M2-04)', () => {
  test.use({ storageState: authFile('instructor') });

  const search = 'Search by name or number';

  // Other specs invite learners into this same instructor's list, so the assertions here
  // are about the people and the filters, never about a total that another spec can change.
  test('shows everyone the instructor teaches', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();

    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
    // A learner of the school down the road is not this instructor's to see.
    await expect(page.getByText('Harry Thomas')).toBeHidden();

    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-learners');
  });

  test('finds one learner by name, and by the number in the instructor’s phone', async ({ page }) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    await page.getByPlaceholder(search).fill('noah');
    await expect(page.getByText('1 learner', { exact: true })).toBeVisible();
    await expect(page.getByText('Noah Wilson')).toBeVisible();
    await expect(page.getByText('Jack Taylor')).toBeHidden();
    await expect(page).toHaveURL(/\?q=noah$/);

    // The number is stored as +447700900011 and typed as most people write it.
    await page.getByPlaceholder(search).fill('07700 900011');
    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Noah Wilson')).toBeHidden();

    await page.getByPlaceholder(search).fill('nobody at all');
    await expect(page.getByRole('heading', { name: 'Nobody matches' })).toBeVisible();
  });

  test('filters by where each learner is up to', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    // Someone with a test booked is still learning, so they are under Active (D-065).
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(page).toHaveURL(/\?status=active$/);
    await expect(page.getByText('3 learners')).toBeVisible();
    await expect(page.getByText('Noah Wilson')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeHidden();

    await page.getByRole('button', { name: 'Passed', exact: true }).click();
    await expect(page.getByText('1 learner', { exact: true })).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
    await snap(page, testInfo, 'instructor-learners-passed');

    await page.getByRole('button', { name: 'Waiting', exact: true }).click();
    await expect(page.getByText('Omar Iqbal')).toBeVisible();
    await expect(page.getByText('Jack Taylor')).toBeHidden();
    await expect(page.getByText('Chloe Bennett')).toBeHidden();

    await page.getByRole('button', { name: 'Inactive', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nobody matches' })).toBeVisible();

    await page.getByRole('button', { name: 'Everyone', exact: true }).click();
    await expect(page).toHaveURL(/learners$/);
    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
  });

  test('puts calling and texting one tap away', async ({ page }) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Call Jack Taylor' })).toHaveAttribute('href', 'tel:+447700900011');
    await expect(page.getByRole('link', { name: 'Text Jack Taylor' })).toHaveAttribute('href', 'sms:+447700900011');
  });

  test('a learner has no business reading this page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('learner') });
    const page = await context.newPage();

    await page.goto('/app/instructor/learners');

    await expect(page).toHaveURL(/\/app\/learner$/);
    await context.close();
  });
});
