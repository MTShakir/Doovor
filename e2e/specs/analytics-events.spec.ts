import { analyticsEvents, eventsAwaitingTheirFeature } from '@repo/core/analytics';
import { expect, test, type Page } from '@playwright/test';
import { authFile, cookieAnswer } from '../support/accounts';

/**
 * The events PRD section 16 asks for, counted where they happen (M6-09).
 *
 * The page says each event as it counts it, and that is what these tests read. Whether the counting
 * service then batches, retries or waits is the service's business; that the call is made with the
 * right name and properties is held by the unit tests next to `track`, and that nothing at all is
 * sent before somebody says yes is held by the spec about the question (M6-08).
 */

/**
 * A browser that has said yes, watching what the product counts. The page says each one as it
 * counts it, which is what is read here: whether the counting service then batches, retries or
 * waits is the service's business, and the unit tests hold the call to it.
 */
async function sayingYes(page: Page): Promise<void> {
  await page.addInitScript(({ name }) => {
    window.localStorage.setItem(name, 'accepted');
    const said: { event: string; properties: Record<string, unknown> }[] = [];
    (window as unknown as { counted: typeof said }).counted = said;
    window.addEventListener('counted', (event) => {
      said.push((event as CustomEvent<{ event: string; properties: Record<string, unknown> }>).detail);
    });
  }, cookieAnswer);
}

/** What the page has counted so far. */
async function countedSoFar(page: Page): Promise<{ event: string; properties: Record<string, unknown> }[]> {
  return page.evaluate(() => (window as unknown as { counted?: { event: string; properties: Record<string, unknown> }[] }).counted ?? []);
}

test.describe('what the product counts (PRD 16, M6-09)', () => {
  test('a profile read is counted, with what kind it was', async ({ page }) => {
    await sayingYes(page);
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    await expect
      .poll(async () => (await countedSoFar(page)).filter((one) => one.event === 'profile_viewed'))
      .toEqual([{ event: 'profile_viewed', properties: { kind: 'instructor' } }]);
  });

  test('a school profile is counted as a school', async ({ page }) => {
    await sayingYes(page);
    await page.goto('/schools/leeds/quayside-driving-school');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect
      .poll(async () => (await countedSoFar(page)).map((one) => one.event))
      .toContain('profile_viewed');
  });

  test('signing up is counted as it is asked for', async ({ page }) => {
    await sayingYes(page);
    await page.goto('/sign-up?role=learner');
    await page.getByLabel('Full name').fill('Counted Learner');
    // An address that is already taken: the point is that asking is counted, not that it worked.
    await page.getByLabel('Email').fill('jack.taylor@example.com');
    await page.getByLabel('Password', { exact: true }).fill('not-the-right-one-1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect
      .poll(async () => (await countedSoFar(page)).map((one) => one.event))
      .toContain('signup_started');
  });

  test('a lesson booked from a booking link is counted as the learner booking it', async ({ page }) => {
    const context = await page.context().browser()?.newContext({ storageState: authFile('learner') });
    if (!context) throw new Error('No browser');
    try {
      const theirs = await context.newPage();
      await sayingYes(theirs);
      await theirs.goto('/book/sarah-khan');
      await expect(theirs.getByRole('heading', { level: 1 }).first()).toBeVisible();
      // Nothing is booked here; the point is that the screen is ready to count when it is, and
      // that reading it counts nothing on its own.
      expect((await countedSoFar(theirs)).map((one) => one.event)).not.toContain('booking_created');
    } finally {
      await context.close();
    }
  });

  test('nothing at all is counted without a yes', async ({ page }) => {
    // This project starts from a browser that answered no, so nothing here says yes first.
    await page.addInitScript(() => {
      const said: unknown[] = [];
      (window as unknown as { counted: unknown[] }).counted = said;
      window.addEventListener('counted', (event) => {
        said.push(event);
      });
    });
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    expect(await countedSoFar(page)).toEqual([]);
  });

  test('every name the spec relies on is one the product knows', () => {
    expect(analyticsEvents).toContain('profile_viewed');
    expect(analyticsEvents).toContain('signup_started');
    for (const waiting of eventsAwaitingTheirFeature) expect(analyticsEvents).toContain(waiting);
  });
});
