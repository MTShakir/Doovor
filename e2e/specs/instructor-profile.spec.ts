import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

test.describe('instructor profile (INS-01, M1-11)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows what learners see, and the badge that cannot be edited here', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    // The seeded instructor is verified, so the badge card says so and cannot be edited here.
    await expect(page.getByText('Verified')).toBeVisible();
    await expect(page.getByText(/Badge 416234, expires [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}/)).toBeVisible();

    await expect(page.getByLabel('Display name')).toHaveValue('Sarah Khan');
    await expect(page.getByRole('button', { name: 'Urdu' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Polish' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('img', { name: /coverage area/i })).toHaveAttribute('aria-label', /8 miles around LS6 3QS/);
    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-profile');
  });

  // Both viewports share one seeded instructor, so only one of them writes to it.
  test('keeps an edit', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/profile');
    // Typing before the page is ready fights with the values it is about to put in (D-043).
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();

    await page.getByLabel('About you').fill('Calm, patient and very used to nervous drivers.');
    await page.getByLabel('Years teaching').fill('10');
    await page.getByRole('button', { name: 'Polish' }).click();
    await page.getByRole('button', { name: 'Refresher' }).click();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();
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

  test('changes the exceptions to the circle (COV-02)', { tag: '@desktop-only' }, async ({ page }, testInfo) => {
    await page.goto('/app/instructor/profile');
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();

    // A district the circle misses, then one inside it they will not take (COV-02).
    await page.getByLabel('Postcode district').fill('yo1');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove YO1' })).toBeVisible();

    await page.getByLabel('Postcode district').fill('ls1');
    await page.getByLabel('Rule').selectOption('exclude');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove LS1' })).toBeVisible();
    await expect(page.getByText('Also teach in')).toBeVisible();
    await expect(page.getByText('Do not teach in')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-coverage');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove YO1' })).toBeVisible();

    // Something that is not a district is refused (M1-15 definition of done).
    await page.getByLabel('Postcode district').fill('Leeds');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Enter a district like LS17')).toBeVisible();

    // Put it back for the next test.
    await page.getByRole('button', { name: 'Remove YO1' }).click();
    await page.getByRole('button', { name: 'Remove LS1' }).click();
    await expect(page.getByRole('button', { name: 'Remove LS1' })).toBeHidden();
  });

  test('says what is wrong rather than saving it', async ({ page }) => {
    await page.goto('/app/instructor/profile');
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();

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
