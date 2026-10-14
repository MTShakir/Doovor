import { brand } from '@repo/config/brand';
import { expect, test, type Locator } from '@playwright/test';
import { authFile } from '../support/accounts';
import { addGalleryPhoto, makeInstructor, putOnPlan, removeGalleryPhotos } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { jpegWithGps } from '../support/images';
import { signInThroughForm } from '../support/sign-in';

/**
 * The gallery (D-218): the photo an instructor takes on the day somebody passes, the banner under
 * it, the tick staff give it, and taking one down.
 *
 * Sarah Khan is on Pro, which carries it. Each width uses a learner name of its own and clears up
 * after itself, because both run at once against the same Business and the public page shows the
 * lot of them.
 */
/**
 * The 900 by 1200 photo the first test adds, drawn at that shape: its size was sent with it, so
 * the room it takes is right before it has loaded, and nothing is cut off (D-267).
 */
async function expectWhole(picture: Locator): Promise<void> {
  await expect(picture).toHaveAttribute('width', '900');
  await expect(picture).toHaveAttribute('height', '1200');
  const box = await picture.boundingBox();
  expect(box ? box.height / box.width : null).toBeCloseTo(1200 / 900, 1);
}

test.describe('the gallery (D-218)', () => {
  test.use({ storageState: authFile('instructor') });

  test('adds a pass, and the public page carries it with the banner', async ({ page }, testInfo) => {
    const who = `Gallery Learner ${testInfo.project.name}`;
    await removeGalleryPhotos(who);

    try {
      await page.goto('/app/instructor/gallery');
      await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible();

      // The picture is prepared and uploaded from the browser before anything is saved, which is
      // what takes the camera's position out of it (D-218).
      //
      // Tried until it takes. A file put straight on the input before the form has hydrated is a
      // change event React never hears, and the picker sits there saying "No photo yet" with no
      // error, because nothing ran. Nobody using the app can do that: the button that opens the
      // chooser is not wired before hydration either, so their click does nothing and they click
      // again. Only a test can reach past the button (D-043).
      //
      // Taken upright, as most are on a phone, and shown whole at that shape rather than cut down
      // to a box four wide and three high (D-267).
      const photo = await jpegWithGps(page, { width: 900, height: 1200 });
      await expect(async () => {
        await page.setInputFiles('input[type="file"]', { name: 'passed.jpg', mimeType: 'image/jpeg', buffer: photo });
        await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });

      const passedOn = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString().slice(0, 10);
      await page.getByLabel('The day they passed').fill(passedOn);
      await page.getByRole('textbox', { name: 'Their name' }).fill(who);

      // A name is typed only for somebody who is not on the list: picking one of their learners
      // puts the box away, and takes what was typed with it (D-229).
      const picker = page.getByLabel('Which learner?');
      await picker.selectOption({ index: 1 });
      await expect(page.getByRole('textbox', { name: 'Their name' })).toHaveCount(0);
      await picker.selectOption('');
      const name = page.getByRole('textbox', { name: 'Their name' });
      await expect(name).toHaveValue('');
      await name.fill(who);

      // Nothing goes up without the instructor saying they asked (D-218).
      await page.getByRole('button', { name: 'Add to my gallery' }).click();
      await expect(page.getByText('Confirm you have their permission to show this')).toBeVisible();

      await page.getByRole('checkbox', { name: 'I have their permission to show this photo publicly' }).click();
      await page.getByRole('button', { name: 'Add to my gallery' }).click();
      await expect(page.getByText('Added to your gallery')).toBeVisible();

      const wall = page.getByRole('region', { name: 'Your gallery' });
      await expect(wall).toContainText(`${who} became a driver on`);
      await expectWhole(wall.getByRole('img', { name: new RegExp(`^${who} became a driver on`) }));
      await expectAccessible(page);
      await snap(page, testInfo, 'gallery');

      // On the public profile, which shows three of the wall (D-268): which three depends on the
      // other tests adding to it at the same time, so this one is looked for on the whole wall.
      await page.goto('/instructors/leeds/sarah-khan-driving');
      await expect(page.getByRole('region', { name: 'Learners who passed' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'gallery-public');

      // With the banner and nothing ticked on it yet.
      await page.goto('/instructors/leeds/sarah-khan-driving/gallery');
      await expect(page.getByRole('heading', { level: 1, name: 'Learners who passed with Sarah Khan' })).toBeVisible();
      const ours = page.getByRole('figure').filter({ hasText: `${who} became a driver on` });
      await expect(ours).toContainText('with Sarah Khan Driving');
      await expect(ours.getByText(`Verified by ${brand.name}`)).toHaveCount(0);
      await expectWhole(ours.getByRole('img'));

      // And the instructor takes their own down again.
      await page.goto('/app/instructor/gallery');
      await page.getByRole('button', { name: `Remove ${who}` }).click();
      await expect(page.getByText(`${who} removed from your gallery`)).toBeVisible();
      await expect(page.getByText(`${who} became a driver on`)).toHaveCount(0);
    } finally {
      await removeGalleryPhotos(who);
    }
  });
});

/**
 * The tick, and taking one down (D-218). The admin portal is a desktop screen and says so on a
 * phone (PRD 8.2), so this runs at one width, with a photo put straight in: what it is about is
 * what staff do to one, not how it got there.
 */
test.describe('checking a pass photo (D-218)', { tag: '@desktop-only' }, () => {
  const who = 'Gallery Checked Learner';

  test('staff tick one, and take one down, and the public page follows', async ({ page, browser }, testInfo) => {
    await removeGalleryPhotos(who);
    await addGalleryPhoto('Sarah Khan', who, new Date(Date.now() - 4 * 24 * 3_600_000).toISOString().slice(0, 10));

    const admin = await browser.newContext({ storageState: authFile('admin') });
    const staff = await admin.newPage();
    try {
      // Before anybody has looked at it: on the wall, and without the tick.
      await page.goto('/instructors/leeds/sarah-khan-driving/gallery');
      const before = page.getByRole('figure').filter({ hasText: `${who} became a driver on` });
      await expect(before).toBeVisible();
      await expect(before.getByText(`Verified by ${brand.name}`)).toHaveCount(0);

      await staff.goto('/admin/gallery?onlyUnchecked=unchecked');
      const entry = staff.getByRole('region', { name: who });
      await expect(entry).toContainText('Not checked');
      await expect(entry).toContainText('Name typed in');
      await entry.getByRole('button', { name: `Verify ${who}` }).click();
      await expect(staff.getByText('Ticked', { exact: true })).toBeVisible();
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-gallery');

      // Ticked, it is the first of the profile's three: nothing else on this wall is (D-268).
      await page.goto('/instructors/leeds/sarah-khan-driving');
      const first = page.getByRole('region', { name: 'Learners who passed' }).getByRole('figure').first();
      await expect(first).toContainText(`${who} became a driver on`);
      await expect(first).toContainText(`Verified by ${brand.name}`);

      // Taking one down takes it off the public page, and takes the tick with it.
      await staff.goto('/admin/gallery');
      const again = staff.getByRole('region', { name: who });
      await again.getByRole('button', { name: `Take it down ${who}` }).click();
      await expect(staff.getByText('Taken off the public page')).toBeVisible();
      await expect(again).toContainText('Taken down');

      await page.goto('/instructors/leeds/sarah-khan-driving');
      await expect(page.getByText(`${who} became a driver on`)).toHaveCount(0);
    } finally {
      await admin.close();
      await removeGalleryPhotos(who);
    }
  });
});

/**
 * A school looks after the same wall from its own portal (D-218). It is one wall: a school owner
 * should not have to ask somebody who teaches to take a photo down.
 */
test.describe('a school keeps its own wall (D-218)', () => {
  test.use({ storageState: authFile('schoolOwner') });

  test('the school portal has the gallery, with what its instructors put there', async ({ page }, testInfo) => {
    const who = `School Pass ${testInfo.project.name}`;
    await removeGalleryPhotos(who);
    // Put there by one of the school's own instructors, which is whose photo a school sees.
    await addGalleryPhoto('Emma Clarke', who, new Date(Date.now() - 6 * 24 * 3_600_000).toISOString().slice(0, 10));

    try {
      await page.goto('/app/school/gallery');
      await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your gallery' })).toContainText(`${who} became a driver on`);
      await expect(page.getByRole('region', { name: 'Add a pass' })).toBeVisible();

      // And the school's own public pages carry it: three on its profile, and the whole wall.
      await page.goto('/schools/manchester/quayside-driving-school');
      await expect(page.getByRole('region', { name: 'Learners who passed' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'gallery-school');
      await page.goto('/schools/manchester/quayside-driving-school/gallery');
      await expect(page.getByRole('heading', { level: 1, name: 'Learners who passed with Quayside Driving School' })).toBeVisible();
      await expect(page.getByRole('figure').filter({ hasText: `${who} became a driver on` })).toBeVisible();
    } finally {
      await removeGalleryPhotos(who);
    }
  });
});

/**
 * Three on a profile, and the whole wall on a page of its own (D-268). An instructor of its own,
 * so the three are known: the seeded wall is added to by the tests above at the same time.
 */
test.describe('three on the profile (D-268)', () => {
  test('the checked ones first, and the whole wall opens from it, newest first', async ({ page }, testInfo) => {
    const instructor = await makeInstructor(`Three Passes ${testInfo.project.name}`, '2030-01-01', { listed: false });
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3_600_000).toISOString().slice(0, 10);

    try {
      await putOnPlan(instructor.slug, 'pro');
      await addGalleryPhoto(instructor.name, 'Ava Newest', daysAgo(1));
      await addGalleryPhoto(instructor.name, 'Ben Second', daysAgo(2));
      await addGalleryPhoto(instructor.name, 'Cal Third', daysAgo(3));
      await addGalleryPhoto(instructor.name, 'Dee Checked', daysAgo(5), { verified: true });

      // The one we have checked first, though it is the oldest, then the newest of the rest.
      await page.goto(`/instructors/leeds/${instructor.slug}`);
      const passes = page.getByRole('region', { name: 'Learners who passed' });
      const three = passes.getByRole('figure');
      await expect(three).toHaveCount(3);
      await expect(three.nth(0)).toContainText('Dee Checked became a driver on');
      await expect(three.nth(0)).toContainText(`Verified by ${brand.name}`);
      await expect(three.nth(1)).toContainText('Ava Newest became a driver on');
      await expect(three.nth(2)).toContainText('Ben Second became a driver on');
      await expectAccessible(page);
      await snap(page, testInfo, 'gallery-three');

      // The rest, all four, newest first, on a page of their own with the way back.
      await passes.getByRole('link', { name: 'View full gallery' }).click();
      await expect(page).toHaveURL(new RegExp(`/instructors/leeds/${instructor.slug}/gallery$`));
      await expect(page.getByRole('heading', { level: 1, name: `Learners who passed with ${instructor.name}` })).toBeVisible();
      await expect(page.getByText('4 photos from the day, newest first, shared with their permission.')).toBeVisible();
      const all = page.getByRole('figure');
      await expect(all).toHaveCount(4);
      for (const [place, name] of ['Ava Newest', 'Ben Second', 'Cal Third', 'Dee Checked'].entries()) {
        await expect(all.nth(place)).toContainText(`${name} became a driver on`);
      }
      await expectAccessible(page);
      await snap(page, testInfo, 'gallery-whole', { fullPage: true });

      // Named as the profile is: by the Business (D-269).
      await page.getByRole('link', { name: `${instructor.name} Driving`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/instructors/leeds/${instructor.slug}$`));
    } finally {
      await instructor.remove();
    }
  });
});

/** What somebody on Free sees where the gallery would be (D-209, D-218). */
test.describe('the gallery on Free (D-218)', () => {
  test('is offered rather than hidden, and the public page shows no wall', async ({ page }, testInfo) => {
    // An instructor of its own: a new Business starts on Free, and moving the seeded one would
    // take the gallery away from the tests above, which run at the same time.
    const instructor = await makeInstructor(`Free Gallery ${testInfo.project.name}`, '2030-01-01', { listed: false });

    try {
      await signInThroughForm(page, instructor.email);
      await page.goto('/app/instructor/gallery');
      await expect(page.getByRole('region', { name: 'The gallery is part of Pro' })).toContainText('on the day somebody passes');
      await expect(page.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute('href', '/app/instructor/plan');

      await page.goto(`/instructors/leeds/${instructor.slug}`);
      await expect(page.getByRole('heading', { level: 1, name: instructor.name })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Learners who passed' })).toHaveCount(0);
    } finally {
      await instructor.remove();
    }
  });
});
