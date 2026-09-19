import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { expectNothingRefused, watchForRefusals } from '../support/csp';
import { portals, publicPages } from '../support/screens';
import { settled } from '../support/helpers';

/** Opens each page in turn, and fails on the first thing the policy refuses it. */
async function walk(page: Page, paths: string[]): Promise<void> {
  const refusals = watchForRefusals(page);
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState('load');
    // Long enough for what a page fetches after it paints: the map, a picture, a font.
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await settled(page);
    expectNothingRefused(refusals, path);
  }
}

/**
 * The policy is enforced rather than reported (M6-04, D-138), so anything it refuses is a broken
 * page. Every screen worth loading is opened here and watched. The payment provider's origins
 * cannot be proved this way, because this environment stands a fake card machine in for the real
 * one: those are held to what Stripe publishes, in apps/web/src/lib/security-headers.test.ts.
 *
 * These tests mean the most against a build, which is what CI runs them against: a development
 * build allows a script to run from a string, and a build does not, so a library that asks for that
 * is only refused in the one that matters (D-140).
 */
test.describe('the content security policy holds (NFR-SEC-03, M6-04)', () => {
  test('the headers say what they should', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};
    const policy = headers['content-security-policy'] ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    // Enforced: report-only would let every test below pass while every page was broken.
    expect(headers, 'the policy is enforced, not reported').not.toHaveProperty('content-security-policy-report-only');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['strict-transport-security']).toContain('max-age=63072000');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('microphone=()');
    expect(headers, 'the server does not say what it is made of').not.toHaveProperty('x-powered-by');
  });

  // A profile draws its coverage area as a picture from the map provider (D-132), and an
  // instructor's own profile screen draws the map itself, which builds tile workers from a blob.
  test('every public page loads everything it needs', async ({ page }) => {
    await walk(page, publicPages);
  });

  for (const [role, paths] of portals) {
    test(`${role}: every screen loads without the policy refusing anything`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(role) });
      try {
        await walk(await context.newPage(), paths);
      } finally {
        await context.close();
      }
    });
  }
});
