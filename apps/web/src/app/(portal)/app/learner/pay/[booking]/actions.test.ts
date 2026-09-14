import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const checkoutLesson = vi.fn<(id: string) => Promise<unknown>>();
const keptCardsWith = vi.fn<(id: string) => Promise<unknown>>();
const deliverFakePaymentEvent = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const provider = {
  ensureCustomer: vi.fn(),
  createCheckoutIntent: vi.fn(),
  chargeSavedMethod: vi.fn(),
  createCardSetup: vi.fn(),
};
const fakeCardSetupDone = vi.fn<(id: string) => boolean>();
const env = { PAYMENTS_PROVIDER: 'fake', APP_ENV: 'local' };

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () => Promise.resolve({ session: { userId: 'learner-1', email: 'lee@example.test' } }),
}));
vi.mock('@/lib/payments/checkout', () => ({ checkoutLesson: (id: string) => checkoutLesson(id) }));
vi.mock('@/lib/payments/cards', () => ({ keptCardsWith: (id: string) => keptCardsWith(id) }));
vi.mock('@/lib/payments/provider', () => ({
  paymentsProvider: () => provider,
  fakeCardOutcome: vi.fn(),
  fakeCardSetupDone: (id: string) => fakeCardSetupDone(id),
}));
vi.mock('@/lib/payments/webhook', () => ({
  deliverFakePaymentEvent: (...args: unknown[]) => deliverFakePaymentEvent(...args),
}));
vi.mock('@/env/server', () => ({ serverEnv: env }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { payWithSavedCard, saveTestCard, startCardSetup, startCheckout } = await import('./actions');

const bookingId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

const lesson = {
  bookingId,
  businessId: 'business-1',
  businessName: 'Quayside Driving School',
  accountId: 'acct_1',
  instructorName: 'Tom Walsh',
  lessonType: 'Standard lesson',
  startsAt: '2026-09-17T09:00:00Z',
  durationMinutes: 60,
  pricePence: 4200,
  paid: false,
  status: 'pending_payment',
  holdExpiresAt: '2026-09-13T12:15:00Z',
  requestExpiresAt: null,
  authorised: false,
  feePence: 0,
  feeOwed: null,
  amountPence: 4200,
  paidPence: 0,
  paidBy: null,
  refundPence: 0,
  refundPending: false,
  paymentMode: 'at_booking',
  paymentStatus: 'pending',
};

const kept = {
  businessId: 'business-1',
  businessName: 'Quayside Driving School',
  accountId: 'acct_1',
  customerId: 'cus_lee',
  cards: [{ paymentMethodId: 'pm_kept', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 }],
};

const succeeded = {
  id: 'pi_1',
  status: 'succeeded',
  amountPence: 4200,
  currency: 'gbp',
  clientSecret: null,
  accountId: 'acct_1',
  metadata: { booking_id: bookingId, business_id: 'business-1' },
  chargeId: 'ch_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  env.PAYMENTS_PROVIDER = 'fake';
  rpc.mockResolvedValue({ data: { held: true }, error: null });
  checkoutLesson.mockResolvedValue(lesson);
  keptCardsWith.mockResolvedValue(kept);
  provider.chargeSavedMethod.mockResolvedValue({ ok: true, data: succeeded });
  provider.ensureCustomer.mockResolvedValue({ ok: true, data: { customerId: 'cus_lee' } });
  provider.createCheckoutIntent.mockResolvedValue({
    ok: true,
    data: { ...succeeded, status: 'requires_payment_method', clientSecret: 'pi_1_secret_abc' },
  });
  deliverFakePaymentEvent.mockResolvedValue(true);
});

describe('paying with a kept card (PAY-02, M3-07)', () => {
  it('charges the card with the learner there, once however often it is pressed', async () => {
    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: true, data: { status: 'paid' } });
    expect(rpc).toHaveBeenCalledWith('hold_booking_for_payment', { p_booking_id: bookingId });
    expect(provider.chargeSavedMethod).toHaveBeenCalledWith({
      accountId: 'acct_1',
      customerId: 'cus_lee',
      paymentMethodId: 'pm_kept',
      amountPence: 4200,
      holdOnly: false,
      onSession: true,
      metadata: { booking_id: bookingId, business_id: 'business-1' },
      idempotencyKey: `booking:${bookingId}:4200:card:pm_kept:take`,
    });
    expect(rpc).toHaveBeenCalledWith('set_payment_intent', {
      p_booking_id: bookingId,
      p_provider_ref: 'pi_1',
      p_amount_pence: 4200,
    });
  });

  it('lets the webhook confirm the lesson, standing in for the provider while there is no key', async () => {
    await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(
      { id: 'pi_1', accountId: 'acct_1', amountPence: 4200, metadata: succeeded.metadata },
      'succeeded',
    );
  });

  it('waits for the real webhook with Stripe, and sends nothing itself', async () => {
    env.PAYMENTS_PROVIDER = 'stripe';

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: true, data: { status: 'confirming' } });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('will not charge a card that is not kept for this learner with this Business', async () => {
    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_somebody_else' });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('will not charge anybody who has no cards with this Business', async () => {
    keptCardsWith.mockResolvedValue(null);

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('takes nothing for a lesson that is already paid for', async () => {
    checkoutLesson.mockResolvedValue({ ...lesson, paid: true });

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('takes nothing when the slot cannot be held', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'VALIDATION_FAILED', code: 'P0001' } });

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('says a refused card was refused, and records nothing', async () => {
    provider.chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'Card declined.' });

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: false, code: 'PAYMENT_FAILED', message: 'That card was refused. Use a different card.' });
    expect(rpc).not.toHaveBeenCalledWith('set_payment_intent', expect.anything());
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('sends a learner whose bank wants a check to the card form', async () => {
    provider.chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'AUTHENTICATION_REQUIRED', message: 'Check.' });

    const asked = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });
    expect(asked).toMatchObject({ ok: false, code: 'PAYMENT_FAILED' });
    expect(asked.ok ? '' : asked.message).toMatch(/bank wants to check/);

    provider.chargeSavedMethod.mockResolvedValue({ ok: true, data: { ...succeeded, status: 'requires_action' } });
    const partWay = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });
    expect(partWay).toMatchObject({ ok: false, code: 'PAYMENT_FAILED' });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('refuses what is not a booking and a card', async () => {
    expect(await payWithSavedCard({ bookingId: 'nope', paymentMethodId: 'pm_kept' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await payWithSavedCard({ bookingId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });
});

describe('keeping a card is the learner’s choice (PAY-02, D-079)', () => {
  it('keeps the card only when they ticked the box, as its own attempt', async () => {
    await startCheckout({ bookingId, saveCard: true });

    expect(provider.createCheckoutIntent).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: true, idempotencyKey: `booking:${bookingId}:4200:keep:take` }),
    );
  });

  it('keeps nothing when they did not', async () => {
    await startCheckout({ bookingId });

    expect(provider.createCheckoutIntent).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: false, idempotencyKey: `booking:${bookingId}:4200:once:take` }),
    );
    expect(rpc).toHaveBeenCalledWith('set_payment_intent', {
      p_booking_id: bookingId,
      p_provider_ref: 'pi_1',
      p_amount_pence: 4200,
    });
  });
});

describe('asking for a lesson authorises the card instead (R-12, M3-08)', () => {
  const request = { ...lesson, status: 'requested', holdExpiresAt: null, requestExpiresAt: '2026-09-14T09:00:00Z' };
  const held = { ...succeeded, status: 'requires_capture', chargeId: null };

  it('holds a kept card rather than charging it, and leaves the slot to the request', async () => {
    checkoutLesson.mockResolvedValue(request);
    provider.chargeSavedMethod.mockResolvedValue({ ok: true, data: held });

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: true, data: { status: 'authorised' } });
    expect(provider.chargeSavedMethod).toHaveBeenCalledWith(
      expect.objectContaining({ holdOnly: true, idempotencyKey: `booking:${bookingId}:4200:card:pm_kept:hold` }),
    );
    expect(rpc).not.toHaveBeenCalledWith('hold_booking_for_payment', expect.anything());
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'pi_1' }), 'authorised');
  });

  it('does not count a card that was taken outright as an authorisation', async () => {
    checkoutLesson.mockResolvedValue(request);

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toMatchObject({ ok: false, code: 'PAYMENT_FAILED' });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('authorises a card typed in, as an attempt of its own', async () => {
    checkoutLesson.mockResolvedValue(request);

    await startCheckout({ bookingId });

    expect(provider.createCheckoutIntent).toHaveBeenCalledWith(
      expect.objectContaining({ holdOnly: true, idempotencyKey: `booking:${bookingId}:4200:once:hold` }),
    );
    expect(rpc).not.toHaveBeenCalledWith('hold_booking_for_payment', expect.anything());
  });

  it('asks for nothing twice once the card is authorised', async () => {
    checkoutLesson.mockResolvedValue({ ...request, authorised: true });

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });
});

describe('paying a fee for a lesson called off late or nobody came to (PAY-09, M3-19)', () => {
  const fee = { ...lesson, status: 'no_show', holdExpiresAt: null, paymentStatus: 'failed', feePence: 2100, feeOwed: 'no_show', amountPence: 2100 };

  it('charges the fee, not the lesson, with a key of its own and nothing to hold', async () => {
    checkoutLesson.mockResolvedValue(fee);

    const result = await payWithSavedCard({ bookingId, paymentMethodId: 'pm_kept' });

    expect(result).toEqual({ ok: true, data: { status: 'paid' } });
    expect(rpc).not.toHaveBeenCalledWith('hold_booking_for_payment', expect.anything());
    expect(provider.chargeSavedMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPence: 2100,
        holdOnly: false,
        metadata: { booking_id: bookingId, business_id: 'business-1', fee: 'no_show' },
        idempotencyKey: `fee:${bookingId}:2100:card:pm_kept:take`,
      }),
    );
  });

  it('starts paying a fee with a card typed in, as its own attempt', async () => {
    checkoutLesson.mockResolvedValue({ ...fee, status: 'cancelled', feeOwed: 'late_cancellation' });
    provider.createCheckoutIntent.mockResolvedValue({
      ok: true,
      data: { ...succeeded, amountPence: 2100, status: 'requires_payment_method', clientSecret: 'pi_1_secret_abc' },
    });

    await startCheckout({ bookingId });

    expect(provider.createCheckoutIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPence: 2100,
        metadata: { booking_id: bookingId, business_id: 'business-1', fee: 'cancelled' },
        idempotencyKey: `fee:${bookingId}:2100:once:take`,
      }),
    );
    expect(rpc).toHaveBeenCalledWith('set_payment_intent', { p_booking_id: bookingId, p_provider_ref: 'pi_1', p_amount_pence: 2100 });
    expect(rpc).not.toHaveBeenCalledWith('hold_booking_for_payment', expect.anything());
  });
});

describe('saving a card for a lesson charged the day before (PAY-03, M3-09)', () => {
  const before = { ...lesson, status: 'confirmed', holdExpiresAt: null, paymentMode: 'before_lesson', paymentStatus: 'unpaid' };

  beforeEach(() => {
    checkoutLesson.mockResolvedValue(before);
    provider.createCardSetup.mockResolvedValue({
      ok: true,
      data: { id: 'seti_1', status: 'requires_payment_method', clientSecret: 'seti_1_secret', accountId: 'acct_1', customerId: 'cus_lee' },
    });
  });

  it('starts saving a card on the learner’s own customer, taking nothing', async () => {
    const result = await startCardSetup({ bookingId });

    expect(result).toEqual({ ok: true, data: { setupId: 'seti_1', clientSecret: 'seti_1_secret' } });
    expect(rpc).toHaveBeenCalledWith('set_billing_customer', { p_business_id: 'business-1', p_customer_id: 'cus_lee' });
    expect(provider.createCardSetup).toHaveBeenCalledWith({
      accountId: 'acct_1',
      customerId: 'cus_lee',
      metadata: { booking_id: bookingId, business_id: 'business-1' },
    });
    expect(provider.createCheckoutIntent).not.toHaveBeenCalled();
    expect(provider.chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('is only for lessons charged the day before', async () => {
    checkoutLesson.mockResolvedValue({ ...before, paymentMode: 'at_booking' });

    expect(await startCardSetup({ bookingId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(provider.createCardSetup).not.toHaveBeenCalled();
  });

  it('asks nothing of a Business that cannot take cards', async () => {
    checkoutLesson.mockResolvedValue({ ...before, accountId: null });

    expect(await startCardSetup({ bookingId })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('says so when the provider will not start one', async () => {
    provider.createCardSetup.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });

    expect(await startCardSetup({ bookingId })).toMatchObject({ ok: false, code: 'UNKNOWN' });
  });

  it('stands in for the card form with the fake, and never with Stripe', async () => {
    fakeCardSetupDone.mockReturnValue(true);
    expect(await saveTestCard({ bookingId, setupId: 'seti_1' })).toEqual({ ok: true, data: null });

    fakeCardSetupDone.mockReturnValue(false);
    expect(await saveTestCard({ bookingId, setupId: 'seti_nobody' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });

    env.PAYMENTS_PROVIDER = 'stripe';
    expect(await saveTestCard({ bookingId, setupId: 'seti_1' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});
