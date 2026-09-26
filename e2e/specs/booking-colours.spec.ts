import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, fillUntil, snap } from '../support/helpers';

/**
 * An instructor's own colour on the page a learner sees (D-210).
 *
 * Both widths drive the same seeded Business, so each picks a colour of its own and puts the
 * Business back to the default afterwards.
 */
test.describe('your booking colours (D-210)', () => {
  test.use({ storageState: authFile('instructor') });

  const colourFor = (project: string) => (project === 'mobile' ? '#1A4D8F' : '#5B2A86');

  test('an instructor picks a colour, is refused one nobody could read, and it reaches their page', async ({
    page,
  }, testInfo) => {
    const colour = colourFor(testInfo.project.name);
    const slug = await withDatabase(async (sql) => {
      const [row] = await sql<{ slug: string }[]>`
        select i.public_slug as slug
          from public.instructor_profiles i
          join public.users u on u.id = i.user_id
         where u.email = 'sarah.khan@example.com'`;
      if (!row) throw new Error('The seeded instructor has no public slug');
      return row.slug;
    });

    try {
      await page.goto('/app/instructor/colours');
      await expect(page.getByRole('heading', { level: 1, name: 'Your booking colours' })).toBeVisible();

      // A colour white writing cannot be read on is refused before anything is saved.
      await fillUntil(page.getByLabel('Your colour', { exact: true }), '#F5D76E');
      await expect(page.getByText('too pale for white writing')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save your colour' })).toBeDisabled();

      await fillUntil(page.getByLabel('Your colour', { exact: true }), colour);
      await expect(page.getByText('too pale for white writing')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'What a learner sees' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'booking-colours');

      await page.getByRole('button', { name: 'Save your colour' }).click();
      await expect(page.getByText('Your colour is saved')).toBeVisible();

      // The page a learner opens is drawn in it.
      await page.goto(`/book/${slug}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toHaveCSS(
        'color',
        /rgb\(/,
      );
      const heading = page.getByRole('heading', { level: 1, name: 'Sarah Khan' });
      const painted = await heading.evaluate((node) => getComputedStyle(node).color);
      expect(painted).not.toBe('rgb(0, 0, 0)');
    } finally {
      await withDatabase(async (sql) => sql`
        update public.businesses set brand_colour = null
         where id in (select b.id from public.businesses b
                        join public.memberships m on m.business_id = b.id
                        join public.users u on u.id = m.user_id
                       where u.email = 'sarah.khan@example.com' and m.role = 'owner')`);
    }
  });
});
