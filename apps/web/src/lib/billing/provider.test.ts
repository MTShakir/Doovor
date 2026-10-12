import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = { PAYMENTS_PROVIDER: 'fake' };

vi.mock('server-only', () => ({}));
vi.mock('@/env/server', () => ({ serverEnv: env }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));

const { proBillingOpen, billingWebhookSecrets } = await import('./provider');

beforeEach(() => {
  for (const key of Object.keys(env)) env[key] = undefined;
});

/**
 * Whether Pro can be paid for (D-242). The rule is that money is only taken where the event that
 * records it can arrive, because Pro is granted by a signed webhook and never by a redirect.
 */
describe('when Pro can be paid for (D-242)', () => {
  it('is open with the fake, which delivers its own events', () => {
    env.PAYMENTS_PROVIDER = 'fake';

    expect(proBillingOpen()).toBe(true);
  });

  it('is shut with Stripe and no platform signing secret, so no card is taken that nothing records', () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    env.STRIPE_SECRET_KEY = 'sk_live_present';

    // A secret key alone is not enough: it can take money, but nothing would hear back about it.
    expect(proBillingOpen()).toBe(false);
    expect(billingWebhookSecrets()).toEqual([]);
  });

  it('stays shut when the secret is there but empty', () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    env.STRIPE_WEBHOOK_SECRET = '';

    expect(proBillingOpen()).toBe(false);
  });

  it('opens with Stripe once the platform endpoint exists', () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    env.STRIPE_WEBHOOK_SECRET = 'whsec_platform';

    expect(proBillingOpen()).toBe(true);
  });

  it('is not opened by the Connect secret, which is for somebody else\'s account', () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect';

    // Connect events are learners paying a Business; they never carry a subscription to our plan.
    expect(proBillingOpen()).toBe(false);
  });
});
