import { expect, type Page } from '@playwright/test';
import { totp } from '../../packages/db/src/testing/totp';
import { seedAccounts } from './accounts';

/** Fills a six-digit code into the OTP input (it also accepts typed digits). */
export async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByLabel('Code').first().click();
  await page.keyboard.type(code);
}

/**
 * Signs in through the real form. Seeded staff and school owners then pass the TOTP step
 * with the secret the seed enrolled (AUTH-08).
 */
export async function signInThroughForm(page: Page, email: string, options: { next?: string } = {}): Promise<void> {
  const accounts = seedAccounts();
  await page.goto(options.next ? `/sign-in?next=${encodeURIComponent(options.next)}` : '/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(accounts.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const secret = accounts.totpSecrets[email];
  if (secret) await passTotp(page, secret);
  await expect(page).not.toHaveURL(/\/(sign-in|mfa)/);
}

/** Enters the current TOTP code; if refused (a code already used this window), waits for the next one. */
export async function passTotp(page: Page, secret: string): Promise<void> {
  await expect(page).toHaveURL(/\/mfa/);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await enterCode(page, totp(secret));
    try {
      await expect(page).not.toHaveURL(/\/mfa/, { timeout: 6_000 });
      return;
    } catch {
      await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
    }
  }
  await expect(page).not.toHaveURL(/\/mfa/);
}
