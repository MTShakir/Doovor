import { expect, test } from '@playwright/test';
import { makeSchoolLearner } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * A learner keeps their own pickup points (COV-04, D-182). A learner of this test's own at each
 * width, since both widths would otherwise tick the same place as the one lessons start from.
 */
test.describe('a learner says where lessons start (COV-04, D-182)', () => {
  test('finds the place from a postcode, saves it, and makes it the usual one', async ({ page }, testInfo) => {
    // A postcode the seed has looked up already: the helper builds their profile from that cache.
    const learner = await makeSchoolLearner(`Pippa ${testInfo.project.name}`, { postcode: 'LS6 3QS', transmission: 'manual' });
    try {
      await signInThroughForm(page, learner.email);
      await page.goto('/app/learner/account/pickup-points');
      await expect(page.getByRole('heading', { level: 1, name: 'Pickup points' })).toBeVisible();

      const card = page.getByRole('region', { name: 'Pickup points' });
      const adding = page.getByRole('dialog', { name: 'Add a pickup point' });
      await tapUntil(card.getByRole('button', { name: 'Add one' }), adding);

      // The postcode is checked as it is typed, and says what it found.
      await adding.getByLabel('Postcode').fill('ls2 9jt');
      await expect(adding.getByText(/^Found .*LS2 9JT\.$/)).toBeVisible();

      // The pin is theirs to move, and stays where it is dropped rather than springing back to
      // the middle of the map (D-190).
      const marker = page.locator('.mapboxgl-marker').first();
      const was = await marker.boundingBox();
      if (was === null) throw new Error('No pin on the map to drag');
      await page.mouse.move(was.x + was.width / 2, was.y + was.height / 2);
      await page.mouse.down();
      await page.mouse.move(was.x + was.width / 2 + 50, was.y + was.height / 2 + 30, { steps: 10 });
      await page.mouse.up();
      await expect.poll(async () => (await marker.boundingBox())?.x).toBeGreaterThan(was.x + 40);

      await adding.getByLabel('Address').fill('Leeds station, New Station Street');
      await adding.getByLabel('What to call it').fill('Station');
      await adding.getByRole('checkbox', { name: 'Lessons start here' }).check();
      await expectAccessible(page);
      await snap(page, testInfo, 'learner-pickup-points');
      await adding.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Pickup point added')).toBeVisible();

      const station = card.getByRole('button', { name: 'Change Station' });
      await expect(station).toContainText('LS2 9JT');
      await expect(station).toContainText('Lessons start here');

      // A postcode that is not one is caught, and nothing is saved.
      const changing = page.getByRole('dialog', { name: 'Change this pickup point' });
      await tapUntil(station, changing);
      await changing.getByLabel('Postcode').fill('nope');
      await changing.getByRole('button', { name: 'Save' }).click();
      await expect(changing.getByText('Enter a UK postcode like LS1 4DY')).toBeVisible();

      // And theirs to take away again.
      await changing.getByLabel('Postcode').fill('ls2 9jt');
      await changing.getByRole('button', { name: 'Remove it' }).click();
      await expect(page.getByText('Pickup point removed')).toBeVisible();
      await expect(card.getByRole('button', { name: 'Change Station' })).toHaveCount(0);
    } finally {
      await learner.remove();
    }
  });
});
