import { brand } from '@repo/config/brand';
import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * A school vouches for its own instructors (M9-03, D-280). Emma Clarke teaches at Quayside Driving
 * School: her profile says the school vouches for her, her badge's details change without a photo
 * and without anybody at the platform looking, and the public pages keep the platform's tick for a badge it
 * checked itself, which Sarah Khan, on her own, still has.
 */
test.describe('a school vouches for its own instructors (INS-02, D-280)', () => {
  test.describe('Emma, at the school', () => {
    test.use({ storageState: authFile('schoolInstructor') });

    test('her profile says the school vouches for her, and her badge changes without a photo', async ({ page }, testInfo) => {
      await page.goto('/app/instructor/profile');
      await expect(page.getByText('Vouched for', { exact: true })).toBeVisible();
      await expect(page.getByText(`Quayside Driving School vouches for you, so ${brand.name} does not check your badge.`)).toBeVisible();

      // The details she has today, sent again, so nothing another test reads changes.
      const badge = await withDatabase(async (sql) => {
        const [row] = await sql<{ number: string; expiry: string }[]>`
          select badge_number as number, badge_expiry::text as expiry
            from public.instructor_profiles where public_slug = 'emma-clarke'`;
        if (!row) throw new Error('Emma Clarke is not seeded');
        return row;
      });

      await page.getByRole('button', { name: 'Change your badge' }).click();
      const sheet = page.getByRole('dialog', { name: 'Change your badge' });
      await expect(sheet.getByText('No photo needed.')).toBeVisible();
      // Nothing to photograph, because nobody on the platform checks it.
      await expect(sheet.getByText('Photo of your badge')).toHaveCount(0);
      await sheet.getByLabel('Badge number').fill(badge.number);
      await sheet.getByLabel('Badge expiry date').fill(badge.expiry);
      await sheet.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'school-badge-vouched');

      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Badge details saved')).toBeVisible();
      await expect(page.getByText('Vouched for', { exact: true })).toBeVisible();
      // Not sent to the queue: nothing is waiting for a person to look at it.
      const waiting = await withDatabase(async (sql) => {
        const [row] = await sql<{ status: string }[]>`
          select verification_status::text as status from public.instructor_profiles where public_slug = 'emma-clarke'`;
        return row?.status;
      });
      expect(waiting).toBe('approved');
    });
  });

  test('her public profile names the school, without the tick the platform gives a badge it checked', async ({ page }, testInfo) => {
    await page.goto('/instructors/manchester/emma-clarke');
    await expect(page.getByRole('heading', { level: 1, name: 'Emma Clarke' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quayside Driving School' }).first()).toBeVisible();
    await expect(page.getByText(`checked by ${brand.name}`)).toHaveCount(0);
    // The photo is decoration beside the name, so its tick is found by what it is rather than by role.
    await expect(page.locator('[aria-label="Verified instructor"]')).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'school-instructor-profile-vouched');

    // Sarah Khan runs her own Business, and the platform checked her badge itself.
    await page.goto('/instructors/leeds/sarah-khan-driving');
    await expect(page.getByText(`Approved driving instructor, checked by ${brand.name}`)).toBeVisible();
    await expect(page.locator('[aria-label="Verified instructor"]')).toHaveCount(1);
  });
});
