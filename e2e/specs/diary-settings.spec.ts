import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/**
 * The diary's settings (DIA-01, DIA-02, M1-17). Both viewports share one seeded instructor,
 * so the tests that write run on one of them.
 */
test.describe('diary settings (DIA-01, DIA-02, M1-17)', () => {
  test.use({ storageState: authFile('instructor') });

  test('shows the week that was seeded', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    // Seeded: Monday to Friday 08:00 to 18:00, and Saturday morning.
    await expect(page.getByRole('switch', { name: 'Monday' })).toBeChecked();
    await expect(page.getByLabel('Monday from')).toHaveValue('08:00');
    await expect(page.getByRole('switch', { name: 'Sunday' })).not.toBeChecked();
    await expectAccessible(page);
    await snap(page, testInfo, 'diary-settings');
  });

  test('changes one day without touching the others', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/settings');
    await expect(page.getByRole('button', { name: 'Save hours' })).toBeEnabled();

    await page.getByLabel('Tuesday to').fill('16:00');
    await page.getByRole('button', { name: 'Save hours' }).click();
    await expect(page.getByText('Hours saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Tuesday to')).toHaveValue('16:00');
    await expect(page.getByLabel('Monday to')).toHaveValue('18:00');

    // Put it back for the next run.
    await page.getByLabel('Tuesday to').fill('18:00');
    await page.getByRole('button', { name: 'Save hours' }).click();
    await expect(page.getByText('Hours saved')).toBeVisible();
  });

  test('adds time off, joins an overlapping one and removes it', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/settings');
    await expect(page.getByRole('button', { name: 'Add to diary' })).toBeEnabled();

    await page.getByLabel('Date').fill('2027-03-04');
    await page.getByLabel('From', { exact: true }).fill('09:00');
    await page.getByLabel('To', { exact: true }).fill('12:00');
    await page.getByLabel('Reason').fill('Car service');
    await page.getByRole('button', { name: 'Add to diary' }).click();
    await expect(page.getByText('Time off added')).toBeVisible();
    await expect(page.getByText('Thu 4 Mar, 09:00 to 12:00')).toBeVisible();

    // Definition of done: an overlapping block becomes one block, not two.
    await page.getByLabel('Date').fill('2027-03-04');
    await page.getByLabel('From', { exact: true }).fill('11:00');
    await page.getByLabel('To', { exact: true }).fill('15:00');
    await page.getByLabel('Reason').fill('Still at the garage');
    await page.getByRole('button', { name: 'Add to diary' }).click();
    await expect(page.getByText('Thu 4 Mar, 09:00 to 15:00')).toBeVisible();
    await expect(page.getByText('Thu 4 Mar, 09:00 to 12:00')).toBeHidden();

    await page.getByRole('button', { name: 'Remove Thu 4 Mar, 09:00 to 15:00' }).click();
    await expect(page.getByText('Thu 4 Mar, 09:00 to 15:00')).toBeHidden();
  });

  test('will not take a day that finishes before it starts', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/settings');
    await expect(page.getByRole('button', { name: 'Add to diary' })).toBeEnabled();

    await page.getByLabel('Date').fill('2027-03-05');
    await page.getByLabel('From', { exact: true }).fill('15:00');
    await page.getByLabel('To', { exact: true }).fill('09:00');
    await page.getByRole('button', { name: 'Add to diary' }).click();

    await expect(page.getByText('The finish time has to be after the start time')).toBeVisible();
  });
});

test.describe('booking rules (PRD 11.1, DIA-05, DIA-06, BOK-06, M1-18)', () => {
  test.use({ storageState: authFile('instructor') });

  test('keeps a change, and refuses one outside the range', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/settings');
    await expect(page.getByRole('button', { name: 'Save booking rules' })).toBeEnabled();

    // An independent instructor owns their Business, so they set everything.
    await expect(page.getByLabel('Gap between lessons')).toHaveValue('30');
    await expect(page.getByLabel('Least notice')).toHaveValue('24');

    await page.getByLabel('Gap between lessons').fill('45');
    await page.getByLabel('Least notice').fill('48');
    await page.getByLabel('Charged for a late cancellation').selectOption('50');
    await page.getByRole('button', { name: 'Save booking rules' }).click();
    await expect(page.getByText('Booking rules saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Gap between lessons')).toHaveValue('45');
    await expect(page.getByLabel('Least notice')).toHaveValue('48');

    // The range from PRD 11.1 is enforced in the form and again in the database.
    await page.getByLabel('How far ahead learners can book').fill('30');
    await page.getByRole('button', { name: 'Save booking rules' }).click();
    await expect(page.getByText('Choose between 1 and 26 weeks')).toBeVisible();

    // Put it back for the next run.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Save booking rules' })).toBeEnabled();
    await page.getByLabel('Gap between lessons').fill('30');
    await page.getByLabel('Least notice').fill('24');
    await page.getByLabel('Charged for a late cancellation').selectOption('100');
    await page.getByRole('button', { name: 'Save booking rules' }).click();
    await expect(page.getByText('Booking rules saved')).toBeVisible();
  });
});

test.describe('booking rules a school owns (SCH-04)', () => {
  test.use({ storageState: authFile('schoolInstructor') });

  test('an instructor at a school sets only what is theirs', { tag: '@desktop-only' }, async ({ page }) => {
    await page.goto('/app/instructor/settings');

    await expect(page.getByLabel('Gap between lessons')).toBeVisible();
    await expect(page.getByLabel('Least notice')).toBeHidden();
    await expect(page.getByText('Your school sets the notice, the horizon and the cancellation rules.')).toBeVisible();
  });
});
