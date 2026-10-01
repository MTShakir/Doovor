import 'server-only';
import { brand } from '@repo/config/brand';
import { plans } from '@repo/config/plans';
import {
  createFakeBillingProvider,
  stripeBillingProvider,
  type BillingProvider,
  type FakeBillingProvider,
} from '@repo/providers/billing';
import { serverEnv } from '@/env/server';
import { getAppUrl } from '@/lib/app-url';

/**
 * What takes money for Pro in this environment (9.18, D-231, ARCHITECTURE 10).
 *
 * The same switch as Connect, because it is the same Stripe account and the same secret key: a
 * platform taking a subscription and a platform making direct charges are two products on one
 * account. What differs is the signing secret, since platform events and connected account
 * events come from different endpoints (RUNBOOK 3.7).
 */

/**
 * One fake for the whole process, so a checkout started by a Server Action can be finished by the
 * route that stands in for Stripe's page. On `globalThis` for the same reason the payments fake
 * is: in development a route handler and a Server Action are not always the same module instance,
 * and two fakes would each hold half the story.
 */
const held = Symbol.for('platform.billing.fake');
const process_ = globalThis as unknown as Record<symbol, FakeBillingProvider | undefined>;

export function theFakeBilling(): FakeBillingProvider {
  process_[held] ??= createFakeBillingProvider({
    // Subscribing happens on a page of ours rather than Stripe's, so the whole flow can be
    // clicked through without a key.
    checkoutUrl: ({ sessionId, successUrl }) =>
      `${getAppUrl()}/dev/subscribe?session=${encodeURIComponent(sessionId)}&return=${encodeURIComponent(successUrl)}`,
  });
  return process_[held];
}

/** What the invoice line says. Built here, because the brand lives in one file (brand.ts). */
export const proProductName = `${brand.name} ${plans.pro.label}`;

export function billingProvider(): BillingProvider {
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') return theFakeBilling();

  return stripeBillingProvider({ secretKey: serverEnv.STRIPE_SECRET_KEY, productName: proProductName });
}

/** Whether Pro can be paid for at all here. Without a provider the screen says so, rather than failing. */
export function billingIsLive(): boolean {
  return serverEnv.PAYMENTS_PROVIDER !== 'stripe' || typeof serverEnv.STRIPE_SECRET_KEY === 'string';
}

/**
 * The secret a platform event may have been signed with.
 *
 * Only the platform's. Connect's secret is for events on a connected account, and a subscription
 * is not one: accepting either here would mean an event from somebody else's account could be
 * presented as a payment for our own plan.
 */
export function billingWebhookSecrets(): string[] {
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') return [localBillingWebhookSecret];

  const secret = serverEnv.STRIPE_WEBHOOK_SECRET;
  return typeof secret === 'string' && secret.length > 0 ? [secret] : [];
}

/**
 * What the fake signs with. Local and test runs have no Stripe endpoint to take a secret from,
 * and a webhook route nobody can exercise locally is a webhook route nobody finds the bugs in.
 */
export const localBillingWebhookSecret = 'whsec_local_fake_billing';

/** The signature the fake's check expects. Nothing to sign with Stripe, which signs its own. */
export function signFakeBillingEvent(): string | null {
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return null;
  return 'fake-signature';
}
