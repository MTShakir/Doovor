import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap } from '../support/helpers';

/**
 * Who sells a school's lessons, which its owner says from Settings (M9-04, D-281). Quayside sells its
 * own lessons through the instructors who teach under it. Both widths would change the same school
 * at once, so this runs on the larger one; the cards are tested on a phone in school onboarding.
 */
test.describe('who sells a school\'s lessons (SCH-05, D-281)', { tag: '@desktop-only' }, () => {
  test.describe('the owner', () => {
    test.use({ storageState: authFile('schoolOwner') });

    test('says, and is told why their instructors cannot sell every lesson while some teach under the school', async ({ page }, testInfo) => {
      await page.goto('/app/school/settings');
      const card = page.getByRole('region', { name: 'How your school works' });
      await expect(card.getByRole('radio', { name: /^We sell the lessons/ })).toBeChecked();
      await expect(card.getByRole('link', { name: 'How HMRC sees driving schools' })).toHaveAttribute('href', /vtaxper66100/);

      // Emma and Tom teach under Quayside, so its lessons cannot all be theirs to sell yet.
      await card.getByText('Our instructors sell their own', { exact: true }).click();
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card.getByRole('alert')).toContainText('Some of your instructors still teach under the school');
      await expectAccessible(page);

      await card.getByText('Some of each', { exact: true }).click();
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved')).toBeVisible();
      await page.reload();
      await expect(page.getByRole('region', { name: 'How your school works' }).getByRole('radio', { name: /^Some of each/ })).toBeChecked();
      await snap(page, testInfo, 'school-who-sells');

      // Back as it was, for everybody else.
      const again = page.getByRole('region', { name: 'How your school works' });
      await again.getByText('We sell the lessons', { exact: true }).click();
      await again.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved')).toBeVisible();
    });
  });

  test.describe('a manager', () => {
    test.use({ storageState: authFile('schoolManager') });

    test('does not see it: it is the owner\'s to say', async ({ page }) => {
      await page.goto('/app/school/settings');
      // Exact: a school that sells some of each has "Prices for linked instructors" beside it, which
      // another spec in the same run may have made it.
      await expect(page.getByRole('region', { name: 'Prices', exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'How your school works' })).toHaveCount(0);
    });
  });
});
