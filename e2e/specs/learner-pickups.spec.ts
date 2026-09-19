import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { clearBusinessPickups, userIdOf } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/**
 * A learner's pickup points, kept from their card (COV-04, D-168). A learner of Sarah Khan's each,
 * one per width, so the two widths never change the same learner's places at once.
 */
test.describe("a learner's pickup points from their card (COV-04, D-168)", () => {
  test.use({ storageState: authFile('instructor') });

  test('adds where lessons start, corrects it and removes it', async ({ page }, testInfo) => {
    const email = testInfo.project.name === 'mobile' ? 'noah.wilson@example.com' : 'omar.iqbal@example.com';
    await clearBusinessPickups(email);
    await page.goto(`/app/instructor/learners/${await userIdOf(email)}`);

    const card = page.getByRole('region', { name: 'Pickup points' });
    const adding = page.getByRole('dialog', { name: 'Add a pickup point' });
    await tapUntil(card.getByRole('button', { name: 'Add one' }), adding);
    await adding.getByLabel('What kind of place?').selectOption({ label: 'Somewhere else' });
    await adding.getByLabel('What to call it').fill('Station');
    await adding.getByLabel('Address').fill('Leeds station, New Station Street');
    await adding.getByLabel('Postcode').fill('nope');
    await adding.getByRole('checkbox', { name: 'Lessons start here' }).check();

    // A postcode that is not one is caught before anything is saved.
    await adding.getByRole('button', { name: 'Save' }).click();
    await expect(adding.getByText('Enter a UK postcode like LS1 4DY')).toBeVisible();
    await adding.getByLabel('Postcode').fill('ls2 9jt');
    await adding.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Pickup point added')).toBeVisible();

    const station = card.getByRole('button', { name: 'Change Station' });
    await expect(station).toContainText('Lessons start here');
    await expect(station).toContainText('LS2 9JT');
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-pickups');

    // Corrected where it is.
    const changing = page.getByRole('dialog', { name: 'Change this pickup point' });
    await tapUntil(station, changing);
    await changing.getByLabel('What to call it').fill('Train station');
    await changing.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Pickup point saved')).toBeVisible();
    const renamed = card.getByRole('button', { name: 'Change Train station' });
    await expect(renamed).toBeVisible();

    // And taken away.
    await tapUntil(renamed, changing);
    await changing.getByRole('button', { name: 'Remove it' }).click();
    await expect(page.getByText('Pickup point removed')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Change Train station' })).toHaveCount(0);
  });
});
