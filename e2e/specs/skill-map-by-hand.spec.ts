import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { userIdOf } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/**
 * An instructor sets a skill on a learner's map by hand, from their progress page (PRG-02, PRG-03,
 * D-169). A learner of Sarah Khan's each, one per width, whom no other spec rates, so the map
 * shows only what this test set.
 */
test.describe("a skill set by hand on a learner's map (PRG-02, PRG-03, D-169)", () => {
  test.use({ storageState: authFile('instructor') });

  test('taps an area of the map, sets where they are with it, and sets it again', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    const email = mobile ? 'olivia.brown@example.com' : 'omar.iqbal@example.com';
    await page.goto(`/app/instructor/learners/${await userIdOf(email)}/progress`);
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    if (mobile) await page.getByRole('tab', { name: 'Skill map' }).click();

    const map = page.getByRole('list', { name: 'Skill map' });
    const sheet = page.getByRole('dialog', { name: 'Eco-safe driving' });
    await tapUntil(map.getByRole('button', { name: /^Change Eco-safe driving, now / }), sheet);
    await expect(sheet).toContainText('It covers planning and control.');
    const scale = sheet.getByRole('radiogroup', { name: 'Eco-safe driving, from 1 to 5' });
    await scale.getByRole('radio', { name: '3, Prompted' }).click();
    await expect(scale.getByRole('radio', { name: '3, Prompted' })).toHaveAttribute('aria-checked', 'true');
    await expectAccessible(page);
    await snap(page, testInfo, 'skill-map-by-hand');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Eco-safe driving: Prompted')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(map.getByRole('img', { name: 'Eco-safe driving: 3 of 5, Prompted' })).toBeVisible();

    // Set again, the map shows the latest.
    await tapUntil(map.getByRole('button', { name: 'Change Eco-safe driving, now Prompted' }), sheet);
    await expect(scale.getByRole('radio', { name: '3, Prompted' })).toHaveAttribute('aria-checked', 'true');
    await scale.getByRole('radio', { name: '4, Seldom prompted' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Eco-safe driving: Seldom prompted')).toBeVisible();
    await expect(map.getByRole('img', { name: 'Eco-safe driving: 4 of 5, Seldom prompted' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'skill-map-after');
  });
});
