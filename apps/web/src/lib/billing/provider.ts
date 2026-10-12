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

/**
 * Whether Pro can be paid for here at all (D-242).
 *
 * Only where the event that grants it can arrive. Pro is granted by a signed webhook and never by
 * the browser coming back from Stripe, so taking a card without the platform endpoint's secret
 * would take real money and record nothing: the customer charged, Stripe retrying an event we
 * refuse for three days, and the plan never changing. So the rule is the secret, not a flag
 * somebody has to remember to turn on. With the fake there is nothing to receive, so it is open.
 *
 * This is what lets the first instructors arrive before billing is finished: every one of them
 * starts on Pro through a founding place or a trial, so nobody needs to pay for months.
 */
export function proBillingOpen(): boolean {
  return billingWebhookSecrets().length > 0;
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
