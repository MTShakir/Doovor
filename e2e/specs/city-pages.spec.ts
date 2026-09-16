import { brand } from '@repo/config/brand';
import { expect, test } from '@playwright/test';
import { cachePostcode, makeInstructor, type MadeInstructor } from '../support/database';
import { addDays, expectAccessible, freshPublicPages, robotsOf, settled, snap } from '../support/helpers';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * City, area and automatic pages (PRD 8.3, M5-07). Other tests make instructors in Leeds while these
 * run, so nothing here counts Leeds or Manchester. Each width fills a London area of its own with
 * instructors made for it alone, and reads another that nobody ever fills.
 */
test.describe('city, area and automatic pages (PRD 8.3, M5-07)', () => {
  test('a city lists the instructors search may show, links their profiles and its areas, and says where it sits', async ({ page }, testInfo) => {
    await page.goto('/driving-lessons/manchester');
    await expect(page.getByRole('heading', { level: 1, name: 'Driving lessons in Manchester' })).toBeVisible();
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByRole('link', { name: brand.name })).toBeVisible();
    await expect(breadcrumb.getByText('Driving lessons in Manchester')).toHaveAttribute('aria-current', 'page');

    const instructors = page.getByRole('region', { name: 'Instructors' });
    await expect(instructors.getByRole('link', { name: /^Emma Clarke/ })).toHaveAttribute('href', '/instructors/manchester/emma-clarke');
    await expect(instructors.getByRole('link', { name: /^Tom Walsh/ })).toBeVisible();
    // Aisha Rahman is still waiting to be checked.
    await expect(instructors.getByRole('link', { name: /Aisha Rahman/ })).toHaveCount(0);

    const structured = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as {
      '@type': string;
      itemListElement: { name: string }[];
    };
    expect(structured['@type']).toBe('BreadcrumbList');
    expect(structured.itemListElement.map((item) => item.name)).toEqual([brand.name, 'Driving lessons in Manchester']);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'city-page');

    // The automatic page lists those who teach automatic, and links back to the city.
    await page.getByRole('link', { name: /^Automatic driving lessons in Manchester/ }).click();
    await expect(page).toHaveURL(/\/driving-lessons\/manchester\/automatic$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Automatic driving lessons in Manchester' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Instructors' }).getByRole('link', { name: /^Emma Clarke/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Instructors' }).getByRole('link', { name: /^Tom Walsh/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'All driving lessons in Manchester' })).toHaveAttribute('href', '/driving-lessons/manchester');

    // A profile it lists links back to the city page, as a school page does (PRD 14.6).
    await page.getByRole('region', { name: 'Instructors' }).getByRole('link', { name: /^Emma Clarke/ }).click();
    await expect(page).toHaveURL(/\/instructors\/manchester\/emma-clarke$/);
    const moreIn = page.getByRole('region', { name: 'More in Manchester' });
    await expect(moreIn.getByRole('link', { name: 'Driving lessons in Manchester' })).toHaveAttribute('href', '/driving-lessons/manchester');
    await page.goto('/schools/manchester/quayside-driving-school');
    await expect(moreIn.getByRole('link', { name: 'Driving lessons in Manchester' })).toHaveAttribute('href', '/driving-lessons/manchester');
  });

  test('an area is out of search until three instructors are listed on it, and in once they are', async ({ page }, testInfo) => {
    // A London borough of each width's own: Hackney on a phone, Camden on a wide screen.
    const area =
      testInfo.project.name === 'mobile'
        ? { slug: 'hackney', name: 'Hackney', postcode: 'E8 1DY', latitude: 51.5439, longitude: -0.0553 }
        : { slug: 'camden', name: 'Camden', postcode: 'NW1 8NH', latitude: 51.5405, longitude: -0.1437 };
    await cachePostcode({ postcode: area.postcode, latitude: area.latitude, longitude: area.longitude, district: area.name });

    // Nobody lives in the City of London: thin, and out of search.
    await page.goto('/driving-lessons/london/city-of-london');
    await expect(page.getByRole('heading', { level: 1, name: 'Driving lessons in City of London, London' })).toBeVisible();
    await expect(page.getByText('No instructors are listed here yet.')).toBeVisible();
    expect(await robotsOf(page)).toContain('noindex');

    const made: MadeInstructor[] = [];
    try {
      for (const name of ['Ada', 'Ben', 'Cal']) {
        made.push(await makeInstructor(`${name} ${area.name}`, addDays(today(), 365), { postcode: area.postcode }));
        await freshPublicPages(page);
        await page.goto(`/driving-lessons/london/${area.slug}`);
        await expect(page.getByRole('region', { name: 'Instructors' }).getByRole('listitem')).toHaveCount(made.length);
        // Two is still thin; the third makes it a page worth finding.
        if (made.length < 3) expect(await robotsOf(page)).toContain('noindex');
      }
      expect(await robotsOf(page)).toBeNull();
      await expect(page.getByRole('heading', { level: 1, name: `Driving lessons in ${area.name}, London` })).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'area-page');

      // The city page links the area, with how many are listed there.
      await page.goto('/driving-lessons/london');
      await expect(page.getByRole('region', { name: 'Areas of London' }).getByRole('link', { name: new RegExp(`^${area.name}\\s*3$`) })).toHaveAttribute(
        'href',
        `/driving-lessons/london/${area.slug}`,
      );
    } finally {
      for (const one of made) await one.remove();
      await freshPublicPages(page);
    }
  });

  test('a place without a page is not found', async ({ page }) => {
    for (const path of ['/driving-lessons/atlantis', '/driving-lessons/manchester/croydon', '/driving-lessons/london/nowhere-at-all']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    }
  });
});
