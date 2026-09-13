import 'server-only';
import {
  fakePaymentsProvider,
  stripePaymentsProvider,
  type FakePaymentsProvider,
  type PaymentIntentStatus,
  type PaymentsProvider,
} from '@repo/providers/payments';
import { serverEnv } from '@/env/server';
import { getAppUrl } from '@/lib/app-url';

/**
 * What takes money in this environment (PAY-01, ARCHITECTURE 10). Local and test runs use the
 * fake, which keeps its state in this process and never reaches a network; anywhere with a
 * key uses Stripe.
 */
/**
 * One fake for the whole process, so a payment started by one request can be found by the
 * next one, the way a real provider would. It hangs off `globalThis` rather than a module
 * variable because a route handler and a Server Action are not always the same module
 * instance in development, and two fakes would each hold half the story.
 */
const held = Symbol.for('platform.payments.fake');
const process_ = globalThis as unknown as Record<symbol, FakePaymentsProvider | undefined>;

function theFake(): FakePaymentsProvider {
  process_[held] ??= fakePaymentsProvider({
    // Onboarding happens on a page of ours rather than Stripe's, so the whole flow can be
    // walked through without a key.
    onboardingUrl: (input) =>
      `${getAppUrl()}/dev/connect?account=${encodeURIComponent(input.accountId)}&return=${encodeURIComponent(input.returnUrl)}`,
  });
  return process_[held];
}

export function paymentsProvider(): PaymentsProvider {
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') return theFake();

  return stripePaymentsProvider({ secretKey: serverEnv.STRIPE_SECRET_KEY });
}

/**
 * Marks a fake account as having finished onboarding. Only the fake has such a thing: with
 * Stripe, the person finishes on Stripe's own pages.
 */
export function fakeOnboarding(accountId: string): boolean {
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return false;
  return theFake().completeOnboarding(accountId);
}

/**
 * Stands in for a card going through while the fake is in use, so the whole path from the
 * button to the webhook can be walked locally. With Stripe, the card does this.
 */
export function fakeCardOutcome(
  paymentIntentId: string,
  outcome: 'succeeded' | 'failed',
): {
  id: string;
  accountId: string;
  amountPence: number;
  metadata: Record<string, string>;
  /** Whether the card went through into a payment, or into a hold for a request (R-12). */
  status: PaymentIntentStatus;
} | null {
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return null;
  const intent = theFake().completePayment(paymentIntentId, outcome);
  return intent
    ? {
        id: intent.id,
        accountId: intent.accountId,
        amountPence: intent.amountPence,
        metadata: intent.metadata,
        status: intent.status,
      }
    : null;
}

/**
 * Stands in for somebody finishing saving a card while the fake is in use (PAY-03). With
 * Stripe, the card form does this.
 */
export function fakeCardSetupDone(setupId: string): boolean {
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return false;
  return theFake().completeCardSetup(setupId)?.status === 'succeeded';
}

/**
 * Signs an event body the way the fake's webhook check expects, for the paths that stand in
 * for the provider sending one. Nothing to sign with Stripe, which sends its own.
 */
export function signFakeEvent(body: string): string | null {
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return null;
  return theFake().sign(body, localWebhookSecret);
}

/**
 * The secret the fake signs its events with. Local and test runs have no Stripe endpoint to
 * take a secret from, and a webhook route that cannot be exercised locally is a webhook route
 * nobody finds the bugs in.
 */
export const localWebhookSecret = 'whsec_local_fake';

/** The secrets an incoming event may have been signed with: the platform's, and Connect's. */
export function webhookSecrets(): string[] {
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') return [localWebhookSecret];

  return [serverEnv.STRIPE_WEBHOOK_SECRET, serverEnv.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (secret): secret is string => typeof secret === 'string' && secret.length > 0,
  );
}
