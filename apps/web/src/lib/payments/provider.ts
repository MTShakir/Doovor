import 'server-only';
import {
  fakePaymentsProvider,
  stripePaymentsProvider,
  type FakePaymentsProvider,
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
