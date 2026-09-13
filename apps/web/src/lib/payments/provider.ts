import 'server-only';
import { fakePaymentsProvider, stripePaymentsProvider, type PaymentsProvider } from '@repo/providers/payments';
import { serverEnv } from '@/env/server';

/**
 * What takes money in this environment (PAY-01, ARCHITECTURE 10). Local and test runs use the
 * fake, which keeps its state in this process and never reaches a network; anywhere with a
 * key uses Stripe.
 */
let fake: PaymentsProvider | null = null;

export function paymentsProvider(): PaymentsProvider {
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') {
    // One fake for the whole process, so a payment started by one request can be found by the
    // next one, the way a real provider would.
    fake ??= fakePaymentsProvider({ chargesEnabledAtOnce: true });
    return fake;
  }

  return stripePaymentsProvider({ secretKey: serverEnv.STRIPE_SECRET_KEY });
}
