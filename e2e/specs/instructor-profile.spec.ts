import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

test.describe('instructor profile (INS-01, M1-11)', () => {
  test.use({ storageState: authFile('instructor') });

  test('edits what learners see and keeps it', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    // The seeded instructor is verified, so the badge card says so and cannot be edited here.
    await expect(page.getByText('Verified')).toBeVisible();
    await expect(page.getByText(/Badge 416234, expires [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}/)).toBeVisible();

    await expect(page.getByLabel('Display name')).toHaveValue('Sarah Khan');
    await expect(page.getByRole('button', { name: 'Urdu' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Polish' })).toHaveAttribute('aria-pressed', 'false');
    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-profile');

    await page.getByLabel('About you').fill('Calm, patient and very used to nervous drivers.');
    await page.getByLabel('Years teaching').fill('10');
    await page.getByRole('button', { name: 'Polish' }).click();
    await page.getByRole('button', { name: 'Refresher' }).click();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('About you')).toHaveValue('Calm, patient and very used to nervous drivers.');
    await expect(page.getByLabel('Years teaching')).toHaveValue('10');
    await expect(page.getByRole('button', { name: 'Polish' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Refresher' })).toHaveAttribute('aria-pressed', 'true');

    // Put it back, so the seeded data is what the next test expects.
    await page.getByLabel('About you').fill('Calm, patient instructor with 9 years of experience. Nervous drivers are very welcome.');
    await page.getByLabel('Years teaching').fill('9');
    await page.getByRole('button', { name: 'Polish' }).click();
    await page.getByRole('button', { name: 'Refresher' }).click();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
  });

  test('says what is wrong rather than saving it', async ({ page }) => {
    await page.goto('/app/instructor/profile');

    await page.getByLabel('About you').fill('x'.repeat(301));
    await page.getByLabel('Years teaching').fill('nine');
    await page.getByRole('button', { name: 'Save profile' }).click();

    await expect(page.getByText('Use 300 characters or fewer')).toBeVisible();
    await expect(page.getByText('Enter a whole number of years, up to 70')).toBeVisible();
    await expect(page.getByText('Profile saved')).toBeHidden();
  });
});

test.describe('trainee instructors (INS-04, R-18, M1-14)', () => {
  test.use({ storageState: authFile('trainee') });

  test('a trainee is told they need a supervisor before they can take bookings', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/profile');

    // The seeded trainee teaches for a school, which supervises her.
    await expect(page.getByRole('heading', { name: 'Trainee instructor' })).toBeVisible();
    await expect(page.getByText('A school is supervising you, so you can take bookings.')).toBeVisible();
    await snap(page, testInfo, 'instructor-profile-trainee');
  });
});
