import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const packageOffer = vi.fn<(id: string) => Promise<unknown>>();
const keptCardsWith = vi.fn<(id: string) => Promise<unknown>>();
const deliverFakePaymentEvent = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const fakeCardOutcome = vi.fn<(id: string, outcome: string) => unknown>();
const provider = {
  ensureCustomer: vi.fn(),
  createCheckoutIntent: vi.fn(),
  chargeSavedMethod: vi.fn(),
};
const env = { PAYMENTS_PROVIDER: 'fake', APP_ENV: 'local' };

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () => Promise.resolve({ session: { userId: 'learner-1', email: 'amelia@example.test' } }),
}));
vi.mock('@/lib/payments/packages', () => ({ packageOffer: (id: string) => packageOffer(id) }));
vi.mock('@/lib/payments/cards', () => ({ keptCardsWith: (id: string) => keptCardsWith(id) }));
vi.mock('@/lib/payments/provider', () => ({
  paymentsProvider: () => provider,
  fakeCardOutcome: (id: string, outcome: string) => fakeCardOutcome(id, outcome),
}));
vi.mock('@/lib/payments/webhook', () => ({
  deliverFakePaymentEvent: (...args: unknown[]) => deliverFakePaymentEvent(...args),
}));
vi.mock('@/env/server', () => ({ serverEnv: env }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const refuseWhileViewing = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));

const { payPackageWithSavedCard, payPackageWithTestCard, startPackageCheckout } = await import('./actions');

const packageId = '3b0f6a52-1c8e-4d7a-9c61-2f0e9b4d7a13';
const attemptId = '9d2c4e61-7a3b-4f5c-8e1d-6b0a2c9f4e87';

const offer = {
  packageId,
  businessId: 'business-1',
  businessName: 'Quayside Driving School',
  accountId: 'acct_1',
  name: '10 hours',
  minutes: 600,
  pricePence: 38000,
  expiryDays: 365,
  onSale: true,
  suspended: false,
};

const metadata = {
  package_id: packageId,
  business_id: 'business-1',
  learner_id: 'learner-1',
  minutes: '600',
  expiry_days: '365',
  starts_now: 'yes',
};

const kept = {
  businessId: 'business-1',
  businessName: 'Quayside Driving School',
  accountId: 'acct_1',
  customerId: 'cus_amelia',
  cards: [{ paymentMethodId: 'pm_kept', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 }],
};

const succeeded = {
  id: 'pi_1',
  status: 'succeeded',
  amountPence: 38000,
  currency: 'gbp',
  clientSecret: null,
  accountId: 'acct_1',
  metadata,
  chargeId: 'ch_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  env.PAYMENTS_PROVIDER = 'fake';
  env.APP_ENV = 'local';
  rpc.mockResolvedValue({ data: 'billing-1', error: null });
  packageOffer.mockResolvedValue(offer);
  keptCardsWith.mockResolvedValue(kept);
  provider.ensureCustomer.mockResolvedValue({ ok: true, data: { customerId: 'cus_amelia' } });
  provider.createCheckoutIntent.mockResolvedValue({
    ok: true,
    data: { ...succeeded, status: 'requires_payment_method', clientSecret: 'pi_1_secret_abc' },
  });
  provider.chargeSavedMethod.mockResolvedValue({ ok: true, data: succeeded });
  deliverFakePaymentEvent.mockResolvedValue(true);
});

describe('starting to pay for a package (PAY-04, M3-13)', () => {
  it('charges the package price on the Business account, saying what it buys', async () => {
    const result = await startPackageCheckout({ packageId, attemptId, startNow: true, saveCard: false });

    expect(result).toEqual({ ok: true, data: { clientSecret: 'pi_1_secret_abc', amountPence: 38000, accountId: 'acct_1' } });
    expect(provider.createCheckoutIntent).toHaveBeenCalledWith({
      accountId: 'acct_1',
      amountPence: 38000,
      customerId: 'cus_amelia',
      holdOnly: false,
      savePaymentMethod: false,
      metadata,
      idempotencyKey: `package:${packageId}:learner-1:${attemptId}:38000:once`,
      statementDescriptor: 'LESSONS',
    });
    expect(rpc).toHaveBeenCalledWith('set_billing_customer', { p_business_id: 'business-1', p_customer_id: 'cus_amelia' });
  });

  it('leaves the time limit out of a package whose hours never run out', async () => {
    packageOffer.mockResolvedValue({ ...offer, expiryDays: null });

    await startPackageCheckout({ packageId, attemptId, startNow: true });

    const sent = provider.createCheckoutIntent.mock.calls[0]?.[0] as { metadata: Record<string, string> };
    expect(sent.metadata).not.toHaveProperty('expiry_days');
  });

  it('asks nothing of the card until the learner has said their lessons may start straight away (D-086)', async () => {
    const result = await startPackageCheckout({ packageId, attemptId, startNow: false });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED', message: expect.stringContaining('Start my lessons straight away') as unknown });
    expect(provider.createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('sells nothing the learner cannot see, has been taken off sale, cannot be paid by card, or is sold by a suspended Business', async () => {
    packageOffer.mockResolvedValueOnce(null);
    expect(await startPackageCheckout({ packageId, attemptId, startNow: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });

    packageOffer.mockResolvedValueOnce({ ...offer, onSale: false });
    expect(await startPackageCheckout({ packageId, attemptId, startNow: true })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });

    packageOffer.mockResolvedValueOnce({ ...offer, accountId: null });
    expect(await startPackageCheckout({ packageId, attemptId, startNow: true })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });

    // A Business platform staff have suspended sells nothing meanwhile (ADM-02).
    packageOffer.mockResolvedValueOnce({ ...offer, suspended: true });
    expect(await startPackageCheckout({ packageId, attemptId, startNow: true })).toMatchObject({
      ok: false,
      code: 'BUSINESS_SUSPENDED',
      message: 'Quayside Driving School is not selling packages at the moment.',
    });

    expect(provider.createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a package and an attempt', async () => {
    expect(await startPackageCheckout({ packageId: 'nope', attemptId, startNow: true })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await startPackageCheckout({ packageId, startNow: true })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('says so when the provider cannot start the payment', async () => {
    provider.createCheckoutIntent.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'down' });

    expect(await startPackageCheckout({ packageId, attemptId, startNow: true })).toMatchObject({
      ok: false,
      code: 'PAYMENT_FAILED',
    });
  });
});

describe('paying for a package with a kept card (PAY-02)', () => {
  it('charges the kept card with the learner there, once however often it is pressed', async () => {
    const result = await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: true, data: { status: 'paid' } });
    expect(provider.chargeSavedMethod).toHaveBeenCalledWith({
      accountId: 'acct_1',
      customerId: 'cus_amelia',
      paymentMethodId: 'pm_kept',
      amountPence: 38000,
      holdOnly: false,
      onSession: true,
      metadata,
      idempotencyKey: `package:${packageId}:learner-1:${attemptId}:38000:card:pm_kept`,
    });
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(
      { id: 'pi_1', accountId: 'acct_1', amountPence: 38000, metadata },
      'succeeded',
    );
  });

  it('waits for the real webhook with Stripe, and sends nothing itself', async () => {
    env.PAYMENTS_PROVIDER = 'stripe';

    expect(await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' })).toEqual({
      ok: true,
      data: { status: 'confirming' },
    });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('will not charge a card that is not kept for this learner with this Business', async () => {
    expect(
      await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_somebody_else' }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('will not charge before the learner has said their lessons may start straight away', async () => {
    expect(
      await payPackageWithSavedCard({ packageId, attemptId, startNow: false, paymentMethodId: 'pm_kept' }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('tells the learner when the card is refused, or the bank wants to check it is them', async () => {
    provider.chargeSavedMethod.mockResolvedValueOnce({ ok: false, reason: 'DECLINED', message: 'no' });
    expect(await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' })).toMatchObject({
      ok: false,
      code: 'PAYMENT_FAILED',
      message: 'That card was refused. Use a different card.',
    });

    provider.chargeSavedMethod.mockResolvedValueOnce({ ok: false, reason: 'AUTHENTICATION_REQUIRED', message: 'check' });
    expect(await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' })).toMatchObject({
      ok: false,
      code: 'PAYMENT_FAILED',
    });

    provider.chargeSavedMethod.mockResolvedValueOnce({ ok: true, data: { ...succeeded, status: 'requires_action' } });
    expect(await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' })).toMatchObject({
      ok: false,
      code: 'PAYMENT_FAILED',
    });

    // With what the screen needs to ask the bank, the learner is asked there (M3-23).
    provider.chargeSavedMethod.mockResolvedValueOnce({ ok: true, data: { ...succeeded, status: 'requires_action', clientSecret: 'pi_1_secret' } });
    expect(await payPackageWithSavedCard({ packageId, attemptId, startNow: true, paymentMethodId: 'pm_kept' })).toEqual({
      ok: true,
      data: { status: 'check', clientSecret: 'pi_1_secret', accountId: 'acct_1' },
    });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });
});

describe('the test card for packages (M3-13)', () => {
  it('sends the event the provider would, through the webhook handler', async () => {
    const intent = { id: 'pi_1', accountId: 'acct_1', amountPence: 38000, metadata, status: 'succeeded' };
    fakeCardOutcome.mockReturnValue(intent);

    expect(await payPackageWithTestCard({ packageId, paymentIntentId: 'pi_1', outcome: 'succeeded' })).toEqual({
      ok: true,
      data: { outcome: 'succeeded' },
    });
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(intent, 'succeeded');
  });

  it('only finishes a payment for the package it is on', async () => {
    fakeCardOutcome.mockReturnValue({ id: 'pi_1', accountId: 'acct_1', amountPence: 4200, metadata: { booking_id: 'b-1' }, status: 'succeeded' });

    expect(await payPackageWithTestCard({ packageId, paymentIntentId: 'pi_1', outcome: 'succeeded' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('does not exist with a real provider, or in production', async () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    expect(await payPackageWithTestCard({ packageId, paymentIntentId: 'pi_1', outcome: 'succeeded' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });

    env.PAYMENTS_PROVIDER = 'fake';
    env.APP_ENV = 'production';
    expect(await payPackageWithTestCard({ packageId, paymentIntentId: 'pi_1', outcome: 'succeeded' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(fakeCardOutcome).not.toHaveBeenCalled();
  });
});
