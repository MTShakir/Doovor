import { brand } from '@repo/config/brand';
import { expect, test } from '@playwright/test';
import { expectAccessible, snap } from '../support/helpers';

test('home placeholder renders with brand tokens and security headers', async ({ page }, testInfo) => {
  const response = await page.goto('/');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['x-request-id']).toBeTruthy();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(brand.name);
  // Colours come from brand.ts through CSS variables (D-005).
  const yellow = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-yellow').trim());
  expect(yellow).toBe(brand.colours.yellow);
  await expectAccessible(page);
  await snap(page, testInfo, 'home');
});

test('health check responds', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});
