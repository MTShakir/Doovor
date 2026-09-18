import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, settled, snap } from '../support/helpers';

// A browser that has answered nothing, which every other project is not (M6-08).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Nothing is counted until somebody says yes (NFR-PRV-02, M6-08, D-144).
 *
 * The counting host points at the app's own stand-in while the tests run, so a request to it is
 * proof that something was sent, and its absence is proof that nothing was. Each test starts with
 * no answer saved, which is how a first visit arrives.
 */
const counted = '/dev/counted';

/** Every request the page made to the counting host, in the order it made them. */
function watchForCounting(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(counted)) sent.push(request.url());
  });
  return sent;
}

test.describe('the cookie question (NFR-PRV-02, M6-08)', () => {
  test('nothing is sent before an answer, and the question is asked', async ({ page }, testInfo) => {
    const sent = watchForCounting(page);
    await page.goto('/');
    await settled(page);

    const question = page.getByRole('dialog', { name: 'Cookies' });
    await expect(question).toBeVisible();
    await expect(question).toContainText('Nothing is counted until you say yes');
    await expect(question.getByRole('link', { name: 'What we keep' })).toHaveAttribute('href', '/cookies');

    // Long enough for anything that loads after the page has painted.
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    expect(sent, 'nothing was sent to the counting host before an answer').toEqual([]);

    await expectAccessible(page);
    await snap(page, testInfo, 'cookie-question');
  });

  test('saying no keeps it that way, on this page and the next', async ({ page }) => {
    const sent = watchForCounting(page);
    await page.goto('/pricing');
    await page.getByRole('dialog', { name: 'Cookies' }).getByRole('button', { name: 'No thanks' }).click();
    await expect(page.getByRole('dialog', { name: 'Cookies' })).toBeHidden();

    await page.goto('/learners');
    await settled(page);
    await expect(page.getByRole('dialog', { name: 'Cookies' }), 'the question is not asked again').toBeHidden();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    expect(sent, 'saying no means nothing is sent').toEqual([]);
  });

  test('saying yes starts the counting, and it can be stopped again', async ({ page }) => {
    // What the page counts, said as it counts it: the counting service's own batching is its
    // business, and this is about the answer being acted on (M6-09).
    await page.addInitScript(() => {
      const said: unknown[] = [];
      (window as unknown as { counted: unknown[] }).counted = said;
      window.addEventListener('counted', (event) => {
        said.push(event);
      });
    });
    await page.goto('/instructors/leeds/sarah-khan');
    await expect(page.getByRole('heading', { level: 1, name: 'Sarah Khan' })).toBeVisible();
    // Nothing yet: the profile has been read, and nobody has said it may be counted.
    expect(await page.evaluate(() => (window as unknown as { counted: unknown[] }).counted.length)).toBe(0);

    await page.getByRole('dialog', { name: 'Cookies' }).getByRole('button', { name: 'Yes, count me' }).click();
    await expect(page.getByRole('dialog', { name: 'Cookies' })).toBeHidden();

    // From here on it counts. The next page read is counted, where the last one was not.
    await page.goto('/schools/leeds/quayside-driving-school');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { counted: unknown[] }).counted.length), {
        message: 'the page counted something once the answer was yes',
      })
      .toBeGreaterThan(0);

    // And the cookies page says where things stand, and can change it.
    await page.goto('/cookies');
    await expect(page.getByText('You have said yes to being counted.')).toBeVisible();
    await page.getByRole('button', { name: 'Stop counting me' }).click();
    await expect(page.getByText('You have said no to being counted, and nothing is.')).toBeVisible();
  });

  test('and it can be asked again', async ({ page }) => {
    await page.goto('/cookies');
    await page.getByRole('dialog', { name: 'Cookies' }).getByRole('button', { name: 'No thanks' }).click();
    await page.getByRole('button', { name: 'Ask me again' }).click();
    await expect(page.getByRole('dialog', { name: 'Cookies' })).toBeVisible();
    await expect(page.getByText('You have not answered yet.')).toBeVisible();
  });
});
