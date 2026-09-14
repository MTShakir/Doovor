import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * What a test needs to work against Stripe test mode (RUNBOOK 3.7a, M3-23): the connected account
 * payments go into, a card typed into the card form (D-099), Stripe's own record of what happened,
 * and a signature Stripe would put on an event. Read from the repository's .env.local, as the app
 * reads it. Nothing here is used by the runs on the fake.
 */

const envFile = path.resolve(import.meta.dirname, '..', '..', '.env.local');
let loaded = false;

function setting(key: string): string {
  if (!loaded) {
    // Existing variables win, as they do for the app.
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    loaded = true;
  }
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not set in .env.local. See RUNBOOK 3.7a.`);
  return value;
}

/** The test-mode account `pnpm stripe:test-account` made for the seeded school. */
export function stripeAccountId(): string {
  return setting('E2E_STRIPE_ACCOUNT_ID');
}

/** Stripe's card for a payment that goes through with no questions from the bank. */
export const visaThatWorks = '4242424242424242';

/**
 * Waits until something has stayed where it is for a moment. Once a card is complete, Stripe grows
 * its frame to offer Link, and scrolling moves everything again; a click sent while either is under
 * way goes to Stripe's frame, which was where the button is now, rather than to the button.
 */
async function stoppedMoving(locator: Locator, samples = 3): Promise<void> {
  let last = '';
  let still = 0;
  const giveUp = Date.now() + 15_000;
  while (still < samples) {
    if (Date.now() > giveUp) throw new Error('The card form kept moving for 15 seconds.');
    await locator.page().waitForTimeout(300);
    const now = JSON.stringify(await locator.boundingBox());
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

/**
 * Types a test card into the card form and presses its button, the way a learner does. The
 * fields are Stripe's, inside its own frame, so they are found by the names Stripe gives them.
 */
export async function payInCardForm(page: Page, button: string | RegExp, card = visaThatWorks): Promise<void> {
  const form = page.getByRole('form', { name: 'Card details' });
  const fields = form.frameLocator('iframe[title="Secure payment input frame"]');
  await fields.locator('input[name="number"]').fill(card);
  await fields.locator('input[name="expiry"]').fill('12 / 34');
  await fields.locator('input[name="cvc"]').fill('123');
  const postcode = fields.locator('input[name="postalCode"]');
  if (await postcode.isVisible()) await postcode.fill('M1 2QF');

  // Scrolled to and settled first, the way a person scrolls down and then taps: a click that has
  // to scroll the page itself arrives at the card frame the scroll has just moved away.
  const pay = form.getByRole('button', { name: button });
  await expect(pay).toBeEnabled();
  await stoppedMoving(pay);
  await pay.scrollIntoViewIfNeeded();
  await stoppedMoving(pay);
  await pay.click();
}

/** Reads Stripe's own record, as the platform, on the connected account when one is given. */
export async function stripeGet<T>(resource: string, account?: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${resource}`, {
    headers: { authorization: `Bearer ${setting('STRIPE_SECRET_KEY')}`, ...(account ? { 'stripe-account': account } : {}) },
  });
  if (!response.ok) throw new Error(`Stripe answered ${String(response.status)} for ${resource}`);
  return (await response.json()) as T;
}

/**
 * The signature Stripe puts on an event, made with the listener's secret: the scheme is public,
 * and a body signed this way is one the app cannot tell from a delivery (R-11).
 */
export function stripeSignature(body: string, at = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac('sha256', setting('STRIPE_CONNECT_WEBHOOK_SECRET')).update(`${String(at)}.${body}`).digest('hex');
  return `t=${String(at)},v1=${digest}`;
}

/** Whether the job runner (`pnpm dev:jobs`) is up, since /dev/events is closed with Stripe. */
export async function jobRunnerIsUp(): Promise<boolean> {
  try {
    return (await fetch('http://127.0.0.1:8288/')).ok;
  } catch {
    return false;
  }
}
