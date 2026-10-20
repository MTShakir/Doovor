import { expect, test } from '@playwright/test';
import { brand } from '@repo/config/brand';
import { cachePostcode, makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * A linked instructor on the public pages (M9-09, D-285): their profile names the school, the
 * school's page lists them, and a badge the school vouched for has no platform tick. The instructor
 * is based where no city page is, so the place pages other tests count are left alone.
 */
test.describe('a linked instructor on the public pages (PUB-01, D-285)', () => {
  test('the profile names the school, and the school lists them', async ({ page }, testInfo) => {
    const label = `Linked public ${testInfo.project.name}`;
    await cachePostcode({ postcode: 'TR21 0LW', latitude: 49.91, longitude: -6.31, district: 'Isles of Scilly' });
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { postcode: 'TR21 0LW' });
    // Linked before the platform had checked him, so the school vouched for his badge (D-280).
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id)
        select ${school.businessId}, p.business_id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
      await sql`update public.instructor_profiles set vouched_at = now() where public_slug = ${oli.slug}`;
    });

    try {
      await page.goto(`/instructors/uk/${oli.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: `${oli.name} Driving` })).toBeVisible();
      await expect(page.getByText('Works with')).toBeVisible();
      await expect(page.getByText(`checked by ${brand.name}`)).toHaveCount(0);
      await expect(page.locator('[aria-label="Verified instructor"]')).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'linked-instructor-profile');

      await page.getByRole('link', { name: school.name }).click();
      await expect(page.getByRole('heading', { level: 1, name: school.name })).toBeVisible();
      const instructors = page.getByRole('region', { name: 'Instructors' });
      await expect(instructors.getByRole('link', { name: new RegExp(`${oli.name} Driving`) })).toBeVisible();
      await expect(page.getByText('1 instructor taking learners')).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'school-page-linked');
    } finally {
      await school.remove();
      await oli.remove();
    }
  });
});
