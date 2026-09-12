import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

/** Adds a learner by hand from the list, and waits until they are on it. */
async function addByHand(page: Page, name: string, number: string): Promise<void> {
  await tapUntil(
    page.getByRole('button', { name: 'Add a learner' }),
    page.getByRole('dialog', { name: 'Add a learner' }),
  );
  await page.getByRole('button', { name: 'Add their details' }).click();
  await expect(page.getByRole('button', { name: 'Add them' })).toBeEnabled();
  await page.getByLabel('Their name').fill(name);
  await page.getByLabel('Their mobile number').fill(number);
  await page.getByRole('button', { name: 'Add them' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a learner' })).toBeHidden();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
}

/** The list an instructor works from (LRN-01, M2-04). */
test.describe('the learner list (LRN-01, M2-04)', () => {
  test.use({ storageState: authFile('instructor') });

  const search = 'Search by name or number';

  // Other specs invite learners into this same instructor's list, so the assertions here
  // are about the people and the filters, never about a total that another spec can change.
  test('shows everyone the instructor teaches', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();

    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
    // A learner of the school down the road is not this instructor's to see.
    await expect(page.getByText('Harry Thomas')).toBeHidden();

    await expectAccessible(page);
    await snap(page, testInfo, 'instructor-learners');
  });

  test('finds one learner by name, and by the number in the instructor’s phone', async ({ page }) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    await page.getByPlaceholder(search).fill('noah');
    await expect(page.getByText('1 learner', { exact: true })).toBeVisible();
    await expect(page.getByText('Noah Wilson')).toBeVisible();
    await expect(page.getByText('Jack Taylor')).toBeHidden();
    await expect(page).toHaveURL(/\?q=noah$/);

    // The number is stored as +447700900011 and typed as most people write it.
    await page.getByPlaceholder(search).fill('07700 900011');
    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Noah Wilson')).toBeHidden();

    await page.getByPlaceholder(search).fill('nobody at all');
    await expect(page.getByRole('heading', { name: 'Nobody matches' })).toBeVisible();
  });

  test('filters by where each learner is up to', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    // Someone with a test booked is still learning, so they are under Active (D-065).
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(page).toHaveURL(/\?status=active$/);
    await expect(page.getByText('Noah Wilson')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeHidden();

    await page.getByRole('button', { name: 'Passed', exact: true }).click();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
    await expect(page.getByText('Omar Iqbal')).toBeHidden();
    await snap(page, testInfo, 'instructor-learners-passed');

    await page.getByRole('button', { name: 'Waiting', exact: true }).click();
    await expect(page.getByText('Omar Iqbal')).toBeVisible();
    await expect(page.getByText('Jack Taylor')).toBeHidden();
    await expect(page.getByText('Chloe Bennett')).toBeHidden();

    await page.getByRole('button', { name: 'Inactive', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nobody matches' })).toBeVisible();

    await page.getByRole('button', { name: 'Everyone', exact: true }).click();
    await expect(page).toHaveURL(/learners$/);
    await expect(page.getByText('Jack Taylor')).toBeVisible();
    await expect(page.getByText('Chloe Bennett')).toBeVisible();
  });

  test('puts calling and texting one tap away', async ({ page }) => {
    await page.goto('/app/instructor/learners');
    await expect(page.getByText('Jack Taylor')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Call Jack Taylor' })).toHaveAttribute('href', 'tel:+447700900011');
    await expect(page.getByRole('link', { name: 'Text Jack Taylor' })).toHaveAttribute('href', 'sms:+447700900011');
  });

  test('opens the card behind a name (LRN-02)', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/learners');
    await page.getByRole('link', { name: 'Jack Taylor', exact: true }).click();

    await expect(page).toHaveURL(/\/app\/instructor\/learners\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Jack Taylor' })).toBeVisible();
    await expect(page.getByText('Manual · LS2 9JT')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+447700900011');
    await expect(page.getByRole('link', { name: 'Text' })).toHaveAttribute('href', 'sms:+447700900011');
    await expect(page.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:jack.taylor@example.com');

    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons.getByText('Hours driven')).toBeVisible();
    await expect(lessons.getByText('Usual lesson')).toBeVisible();
    await expect(lessons.getByText('1 hour', { exact: true })).toBeVisible();

    // COV-04: where to collect them, the usual one first.
    const pickups = page.getByRole('region', { name: 'Pickup points' });
    await expect(pickups.getByText('Home')).toBeVisible();
    await expect(pickups.getByText('Default')).toBeVisible();

    await expectAccessible(page);
    await snap(page, testInfo, 'learner-card');

    await page.getByRole('main').getByRole('link', { name: 'Learners' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  });

  // That no learner can read these is proved in the database, where the rule lives
  // (supabase/tests/27_learner_notes_test.sql). This is about writing and unwriting one.
  test('keeps private notes on the card (LRN-04)', async ({ page }, testInfo) => {
    // A run of its own words: the same spec at the other width writes to the same learner.
    const note = `Nervous on roundabouts, ${testInfo.project.name} ${String(Date.now())}.`;
    await page.goto('/app/instructor/learners');
    await page.getByRole('link', { name: 'Olivia Brown', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Olivia Brown' })).toBeVisible();

    const notes = page.getByRole('region', { name: 'Private notes' });
    await expect(notes.getByRole('button', { name: 'Save note' })).toBeEnabled();
    await notes.getByRole('textbox').fill(note);
    await notes.getByRole('button', { name: 'Save note' }).click();

    const row = notes.locator('li').filter({ hasText: note });
    await expect(row).toHaveCount(1);
    // Signed as the person who wrote it, so a colleague can tell whose note it is.
    await expect(row.getByText('Sarah Khan', { exact: false })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-card-notes');

    // Deleting is forgiving: five seconds to change your mind (PRD 7.1).
    await row.getByRole('button', { name: /^Delete the note/ }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row).toHaveCount(1);

    // Left alone, the note goes when the five seconds are up, and stays gone. The wait is
    // the feature: there is nothing on screen that says the moment has passed.
    await row.getByRole('button', { name: /^Delete the note/ }).click();
    await expect(row).toHaveCount(0);
    await page.waitForTimeout(6000);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Olivia Brown' })).toBeVisible();
    await expect(notes.locator('li').filter({ hasText: note })).toHaveCount(0);
  });

  // The learner it moves about is one it adds itself, so no other test is watching them.
  test('moves a learner through the statuses (LRN-05)', { tag: '@desktop-only' }, async ({ page }, testInfo) => {
    const name = `Sam ${String(Date.now()).slice(-5)}`;
    await page.goto('/app/instructor/learners');
    await addByHand(page, name, `07700 7${String(Date.now()).slice(-5)}`);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    // Somebody added by their instructor is already learning, so they start as Active.
    await tapUntil(
      page.getByRole('button', { name: /Where they are up to: Active/ }),
      page.getByRole('dialog', { name: 'Where are they up to?' }),
    );
    await expect(page.getByText('Has a practical test coming up')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'learner-status', { fullPage: false });

    await page.getByRole('button', { name: 'Test booked Has a practical test coming up' }).click();
    await expect(page.getByRole('dialog', { name: 'Where are they up to?' })).toBeHidden();
    await expect(page.getByRole('button', { name: /Where they are up to: Test booked/ })).toBeVisible();

    // The list follows: a test booked still counts as active, and passed does not (D-065).
    await page.goto('/app/instructor/learners?status=active');
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();

    await page.getByRole('link', { name, exact: true }).click();
    await tapUntil(
      page.getByRole('button', { name: /Where they are up to: Test booked/ }),
      page.getByRole('dialog', { name: 'Where are they up to?' }),
    );
    await page.getByRole('button', { name: 'Passed Passed their test' }).click();
    await expect(page.getByRole('button', { name: /Where they are up to: Passed/ })).toBeVisible();

    await page.goto('/app/instructor/learners?status=active');
    await expect(page.getByRole('link', { name, exact: true })).toBeHidden();
    await page.goto('/app/instructor/learners?status=passed');
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  });

  test('somebody else’s learner is not there to read', async ({ page }) => {
    await page.goto('/app/instructor/learners/00000000-0000-0000-0000-000000000000');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('a learner has no business reading this page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('learner') });
    const page = await context.newPage();

    await page.goto('/app/instructor/learners');

    await expect(page).toHaveURL(/\/app\/learner$/);
    await context.close();
  });
});
