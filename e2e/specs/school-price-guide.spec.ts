import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * A school recommends a price to the instructors linked to it and sets the most they charge, and a
 * linked instructor's price above it is refused (M9-10, D-286). Each width has a school and an
 * instructor of its own.
 */
test.describe('prices for linked instructors (SCH-04, D-286)', () => {
  test('the school sets a recommended price and a most, and the instructor is held to the most', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const label = `Price guide ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id)
        select ${school.businessId}, p.business_id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
    });

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/settings' });
      const guide = manager.getByRole('region', { name: 'Prices for linked instructors' });
      await expect(guide).toContainText('never a fixed price or a lowest one');
      // A recommendation above the most is no recommendation at all.
      await guide.getByLabel('Recommended price an hour, £').fill('50');
      await guide.getByLabel('Most an hour, £').fill('45');
      await guide.getByRole('button', { name: 'Save' }).click();
      await expect(guide.getByText('Recommend no more than the most they can charge')).toBeVisible();
      await guide.getByLabel('Recommended price an hour, £').fill('40');
      await guide.getByRole('button', { name: 'Save' }).click();
      await expect(manager.getByText('Saved', { exact: true })).toBeVisible();
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-price-guide');

      // Oli sells his own lessons at £40 an hour, and is told what the school recommends and allows.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email, { next: '/app/instructor/settings' });
      const prices = instructor.getByRole('region', { name: 'Prices' });
      await expect(prices).toContainText(`${school.name} recommends £40 an hour, and lets you charge at most £45 an hour.`);
      await prices.getByLabel('Price for 1 hour', { exact: true }).fill('50');
      await prices.getByRole('button', { name: 'Save prices' }).click();
      await expect(prices.getByText(`${school.name} lets you charge at most £45 an hour. Lower the prices above it.`)).toBeVisible();
      await prices.getByLabel('Price for 1 hour', { exact: true }).fill('45');
      await prices.getByRole('button', { name: 'Save prices' }).click();
      await expect(instructor.getByText('Prices saved')).toBeVisible();
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'linked-instructor-prices');

      // And on Your school, beside what linking means.
      await instructor.goto('/app/instructor/school');
      await expect(instructor.getByRole('region', { name: school.name })).toContainText('lets you charge at most £45 an hour');
    } finally {
      await managerContext.close();
      await oliContext.close();
      await school.remove();
      await oli.remove();
    }
  });
});
