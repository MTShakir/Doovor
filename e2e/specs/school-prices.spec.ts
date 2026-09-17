import { expect, test, type Browser, type Page } from '@playwright/test';
import { makeSchool, schoolRules, type MadeSchool } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** What the booking link offers for an hour, read as a learner would, signed out. */
async function hourOnBookingLink(browser: Browser, school: MadeSchool): Promise<string[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/book/${school.instructor.slug}`);
  const lesson = page.getByLabel('Which lesson?');
  await expect(lesson).toBeVisible();
  const hours = await lesson.locator('option').allTextContents();
  await context.close();
  return hours.filter((text) => text.includes(', 1 hour,'));
}

async function setOwnPrices(page: Page, school: MadeSchool, allowed: boolean): Promise<void> {
  await page.goto('/app/school/instructors');
  await page
    .getByRole('region', { name: 'Instructors', exact: true })
    .getByRole('button', { name: new RegExp(`^${school.instructor.name},`) })
    .click();
  const sheet = page.getByRole('dialog', { name: school.instructor.name, exact: true });
  const control = sheet.getByRole('switch', { name: /Sets their own prices/ });
  if ((await control.isChecked()) !== allowed) {
    await control.click();
    await expect(control).toBeChecked({ checked: allowed });
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

test.describe('school prices, packages and rules (SCH-04, R-05, R-06, M5-15)', () => {
  test('a school sets its prices, packages and rules, and an instructor it allows charges their own', async ({ browser }, testInfo) => {
    test.slow();
    const school = await makeSchool(`Prices ${testInfo.project.name}`);
    const managerContext = await browser.newContext();
    const manager = await managerContext.newPage();
    try {
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/settings' });
      await expect(manager.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

      // The school's hour goes from £40 to £44, and the booking link says so.
      const prices = manager.getByRole('region', { name: 'Prices', exact: true });
      const hour = prices.getByRole('group', { name: 'Standard lesson' }).getByLabel('Price for 1 hour', { exact: true });
      await expect(hour).toHaveValue('40');
      await hour.fill('44');
      await prices.getByRole('button', { name: 'Save prices' }).click();
      await expect(manager.getByText('Prices saved')).toBeVisible();
      expect(await hourOnBookingLink(browser, school)).toEqual(['Standard lesson, 1 hour, £44']);

      // A package of ten hours.
      const packages = manager.getByRole('region', { name: 'Packages', exact: true });
      await packages.getByRole('button', { name: 'Add a package' }).click();
      const sheet = manager.getByRole('dialog', { name: 'Add a package' });
      await sheet.getByLabel('Name', { exact: true }).fill('10 hours');
      await sheet.getByLabel('Hours', { exact: true }).fill('10');
      await sheet.getByLabel('Price, £').fill('420');
      await sheet.getByLabel('Days to use the hours in').fill('365');
      await sheet.getByRole('button', { name: 'Add package' }).click();
      await expect(manager.getByText('Package added')).toBeVisible();
      await expect(packages.getByRole('button', { name: /^10 hours, 10 hours for £420, use within 365 days/ })).toBeVisible();

      // The cancellation policy for the whole school.
      const rules = manager.getByRole('region', { name: 'Booking and cancellation rules' });
      await rules.getByLabel('Free cancellation up to').fill('24');
      await rules.getByRole('button', { name: 'Save booking rules' }).click();
      await expect(manager.getByText('Booking rules saved')).toBeVisible();
      expect(await schoolRules(school.name)).toMatchObject({ cancellation_window_hours: 24 });
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-settings');

      // The school lets Ines set her own prices, and she charges £50 an hour.
      await setOwnPrices(manager, school, true);
      const instructorContext = await browser.newContext();
      const ines = await instructorContext.newPage();
      await signInThroughForm(ines, school.instructor.email, { next: '/app/instructor/settings' });
      const own = ines.getByRole('region', { name: 'Your prices' });
      const ownHour = own.getByRole('group', { name: 'Standard lesson' }).getByLabel('Price for 1 hour', { exact: true });
      await expect(own.getByText('School price £44. Leave empty to use it.')).toBeVisible();
      await ownHour.fill('50');
      await own.getByRole('button', { name: 'Save prices' }).click();
      await expect(ines.getByText('Prices saved')).toBeVisible();
      await expect(own.getByText(/Learners see the price that applies to you: 1 hour £50/)).toBeVisible();
      await expectAccessible(ines);
      await snap(ines, testInfo, 'instructor-own-prices');
      await instructorContext.close();

      // Hers wins, once, wherever her hour is offered.
      expect(await hourOnBookingLink(browser, school)).toEqual(['Standard lesson, 1 hour, £50']);

      // Taken away, she is back at the school's price.
      await setOwnPrices(manager, school, false);
      expect(await hourOnBookingLink(browser, school)).toEqual(['Standard lesson, 1 hour, £44']);
    } finally {
      await managerContext.close();
      await school.remove();
    }
  });
});
