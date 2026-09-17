import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeInstructor } from '../support/database';
import { addDays, expectAccessible, freshPublicPages, robotsOf, settled, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** An instructor in the list on the Leeds page (PRD 8.3, M5-07), which the page's reader has open. */
function onLeedsPage(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'Instructors' }).getByRole('link', { name: new RegExp(`^${name}`) });
}

/**
 * Out of search (PUB-04, INS-03, M5-06). Instructors made for these tests alone run their badges
 * out or hide their profiles, one for each width, so nobody another test is using is ever out of
 * search, and the two widths never flip the same switch.
 */
test.describe('in search and out of it (PUB-04, INS-03, M5-06)', () => {
  test('acceptance-10: an instructor with an expired badge disappears from search and the profile shows "Not taking new bookings"', async ({
    page,
  }, testInfo) => {
    const current = await makeInstructor(`Chris Current ${testInfo.project.name}`, addDays(today(), 365));
    const expired = await makeInstructor(`Eddie Expired ${testInfo.project.name}`, addDays(today(), -1));
    try {
      await page.goto(`/instructors/leeds/${expired.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: expired.name })).toBeVisible();
      // Once on a phone and once beside the prices on a wide screen: the one this width shows.
      await expect(page.getByText('Not taking new bookings').filter({ visible: true })).toBeVisible();
      // Pointed on to the area's waiting list, while a Business's own is Phase 2 (MKT-10, D-110).
      await expect(page.getByRole('link', { name: 'Find another instructor near you' }).filter({ visible: true })).toHaveAttribute(
        'href',
        '/learners#find-an-instructor',
      );
      await expect(page.getByRole('link', { name: 'Book a lesson' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Next free times' })).toHaveCount(0);
      // Search engines are told to leave it out.
      expect(await robotsOf(page)).toContain('noindex');
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'acceptance-10');

      // Its booking link takes nobody either.
      await page.goto(`/book/${expired.slug}`);
      await expect(page.getByText('This link is not taking bookings')).toBeVisible();

      // While an instructor whose badge is in date is in search, and can be booked.
      await page.goto(`/instructors/leeds/${current.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: current.name })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Book a lesson' })).toBeVisible();
      expect(await robotsOf(page)).toBeNull();

      // The Leeds page lists the one whose badge is in date, and not the other.
      await freshPublicPages(page);
      await page.goto('/driving-lessons/leeds');
      await expect(onLeedsPage(page, current.name)).toBeVisible();
      await expect(onLeedsPage(page, expired.name)).toHaveCount(0);
    } finally {
      await current.remove();
      await expired.remove();
    }
  });

  test('an instructor who hides their profile from search keeps the booking link, and comes back when they choose (PUB-04)', async ({
    page,
  }, testInfo) => {
    const instructor = await makeInstructor(`Hana Hidden ${testInfo.project.name}`, addDays(today(), 365));
    try {
      await freshPublicPages(page);
      await page.goto('/driving-lessons/leeds');
      await expect(onLeedsPage(page, instructor.name)).toBeVisible();

      await signInThroughForm(page, instructor.email, { next: '/app/instructor/profile' });
      const show = page.getByRole('switch', { name: 'Show me in search' });
      await expect(show).toBeChecked();

      // A tap before the page is interactive does nothing (D-043), so it is tapped again only while it
      // has not moved: a second tap on a switch that did move would put it back.
      await expect(async () => {
        if (await show.isChecked()) await show.click();
        await expect(show).not.toBeChecked({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByText('Your profile is hidden from search')).toBeVisible();
      await settled(page);
      await snap(page, testInfo, 'search-listing-hidden');

      // Search engines are told to leave the profile out, and the Leeds page no longer lists it,
      // with nothing but the switch to tell the app.
      await page.goto(`/instructors/leeds/${instructor.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: instructor.name })).toBeVisible();
      expect(await robotsOf(page)).toContain('noindex');
      await page.goto('/driving-lessons/leeds');
      await expect(page.getByRole('heading', { level: 1, name: 'Driving lessons in Leeds' })).toBeVisible();
      await expect(onLeedsPage(page, instructor.name)).toHaveCount(0);
      // The booking link works as before.
      await page.goto(`/book/${instructor.slug}`);
      await expect(page.getByLabel('Which lesson?')).toBeVisible();

      await page.goto('/app/instructor/profile');
      await expect(async () => {
        if (!(await show.isChecked())) await show.click();
        await expect(show).toBeChecked({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByText('Your profile is in search')).toBeVisible();
      await page.goto(`/instructors/leeds/${instructor.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: instructor.name })).toBeVisible();
      expect(await robotsOf(page)).toBeNull();
      await page.goto('/driving-lessons/leeds');
      await expect(onLeedsPage(page, instructor.name)).toBeVisible();
    } finally {
      await instructor.remove();
    }
  });
});
