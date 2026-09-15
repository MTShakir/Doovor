import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeInstructor, setListed } from '../support/database';
import { addDays, expectAccessible, settled, snap } from '../support/helpers';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** What the page tells search engines: "noindex" when it is out of search, nothing when it is in. */
async function robots(page: Page): Promise<string | null> {
  const tag = page.locator('meta[name="robots"]');
  return (await tag.count()) === 0 ? null : tag.first().getAttribute('content');
}

/**
 * Out of search (PUB-04, INS-03, M5-06). Instructors made for these tests alone run their badges
 * out, so nobody another test is using is ever out of date.
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
      await expect(page.getByRole('link', { name: 'Book a lesson' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Next free times' })).toHaveCount(0);
      // Search engines are told to leave it out.
      expect(await robots(page)).toContain('noindex');
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
      expect(await robots(page)).toBeNull();
    } finally {
      await current.remove();
      await expired.remove();
    }
  });

  test.describe('an instructor who hides their profile from search', () => {
    test.use({ storageState: authFile('instructor') });

    test('keeps the booking link, and comes back when they choose (PUB-04)', async ({ page }, testInfo) => {
      try {
        await page.goto('/app/instructor/profile');
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

        await page.goto('/instructors/leeds/sarah-khan');
        await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
        expect(await robots(page)).toContain('noindex');
        // The booking link works as before.
        await page.goto('/book/sarah-khan');
        await expect(page.getByLabel('Which lesson?')).toBeVisible();

        await page.goto('/app/instructor/profile');
        await expect(async () => {
          if (!(await show.isChecked())) await show.click();
          await expect(show).toBeChecked({ timeout: 2000 });
        }).toPass({ timeout: 15_000 });
        await expect(page.getByText('Your profile is in search')).toBeVisible();
        await page.goto('/instructors/leeds/sarah-khan');
        await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
        expect(await robots(page)).toBeNull();
      } finally {
        await setListed('Sarah Khan', true);
      }
    });
  });
});
