/**
 * The Stripe test-mode connected account the M3-23 run takes payments into (RUNBOOK 3.7a).
 *
 *   pnpm stripe:test-account
 *
 * Makes an Express account for the seeded school the way the app makes one when an owner sets up
 * payments (src/payments/stripe.ts), keeps its id in .env.local as E2E_STRIPE_ACCOUNT_ID, and
 * prints the link to Stripe's onboarding. Run it again to see whether the account can take cards,
 * or to get a fresh link while it cannot. Test mode only: it refuses a live key.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';

const envFile = path.resolve(import.meta.dirname, '..', '..', '..', '.env.local');
if (!existsSync(envFile)) {
  console.error('No .env.local at the repository root. Run pnpm db:env first.');
  process.exit(1);
}

const text = readFileSync(envFile, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/);
const valueOf = (key) => {
  const line = lines.find((one) => one.startsWith(`${key}=`));
  return line === undefined ? '' : line.slice(key.length + 1).trim();
};

const secretKey = valueOf('STRIPE_SECRET_KEY');
if (!secretKey.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY in .env.local is not a test mode key. This script only ever works in test mode.');
  process.exit(1);
}

// The same API version the provider pins.
const stripe = new Stripe(secretKey, { apiVersion: '2026-08-26.dahlia' });
const back = 'http://localhost:3000/app/school/money';

let accountId = valueOf('E2E_STRIPE_ACCOUNT_ID');
if (accountId === '') {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'GB',
    email: 'david.okafor@example.com',
    business_profile: { name: 'Quayside Driving School' },
    settings: { payouts: { schedule: { interval: 'daily' } } },
  });
  accountId = account.id;
  const kept = lines.some((one) => one.startsWith('E2E_STRIPE_ACCOUNT_ID='))
    ? lines.map((one) => (one.startsWith('E2E_STRIPE_ACCOUNT_ID=') ? `E2E_STRIPE_ACCOUNT_ID=${accountId}` : one))
    : [...lines.filter((one, index) => !(index === lines.length - 1 && one === '')), `E2E_STRIPE_ACCOUNT_ID=${accountId}`, ''];
  writeFileSync(envFile, kept.join(eol));
  console.log(`Made test account ${accountId} for Quayside Driving School and kept its id in .env.local.`);
}

const account = await stripe.accounts.retrieve(accountId);
if (account.charges_enabled) {
  console.log(`Test account ${accountId} can take cards. Nothing more to do here.`);
} else {
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: back, return_url: back, type: 'account_onboarding' });
  console.log(`Test account ${accountId} cannot take cards yet. Finish Stripe's onboarding, using the test values Stripe offers on each step:`);
  console.log(link.url);
  console.log('The link works once and runs out after a few minutes. Run this again for a new one.');
}
