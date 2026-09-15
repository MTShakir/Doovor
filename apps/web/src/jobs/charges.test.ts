import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const listSavedCards = vi.fn();
const chargeSavedMethod = vi.fn();
const deliverFakePaymentEvent = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const env = { PAYMENTS_PROVIDER: 'fake' };

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ listSavedCards, chargeSavedMethod }) }));
vi.mock('@/lib/payments/webhook', () => ({
  deliverFakePaymentEvent: (...args: unknown[]) => deliverFakePaymentEvent(...args),
}));
vi.mock('@/env/server', () => ({ serverEnv: env }));

const { chargeBeforeLessons } = await import('./charges');

const now = new Date('2026-09-15T09:00:00Z');

const due = (overrides: Record<string, unknown> = {}) => ({
  booking_id: 'book-1',
  business_id: 'business-1',
  account_id: 'acct_1',
  customer_id: 'cus_lee',
  amount_pence: 4200,
  starts_at: '2026-09-16T08:00:00Z',
  ...overrides,
});

const card = (id: string, expiryYear = 2030) => ({
  paymentMethodId: id,
  brand: 'visa',
  last4: '4242',
  expiryMonth: 12,
  expiryYear,
});

const charged = (status = 'succeeded') => ({
  ok: true,
  data: {
    id: 'pi_1',
    status,
    amountPence: 4200,
    currency: 'gbp',
    clientSecret: null,
    accountId: 'acct_1',
    metadata: { booking_id: 'book-1', business_id: 'business-1' },
    chargeId: 'ch_1',
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  env.PAYMENTS_PROVIDER = 'fake';
  deliverFakePaymentEvent.mockResolvedValue(true);
});

describe('charging a lesson the day before (PAY-03, M3-09)', () => {
  it('charges the newest card that still works, with nobody there, once', async () => {
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_old_expired', 2025), card('pm_newer'), card('pm_oldest')] });
    chargeSavedMethod.mockResolvedValue(charged());

    expect(await chargeBeforeLessons({ now })).toEqual({ charged: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith('system_lessons_to_charge', { p_within_hours: 24 });
    expect(chargeSavedMethod).toHaveBeenCalledWith({
      accountId: 'acct_1',
      customerId: 'cus_lee',
      paymentMethodId: 'pm_newer',
      amountPence: 4200,
      metadata: { booking_id: 'book-1', business_id: 'business-1' },
      idempotencyKey: 'before-lesson:book-1:4200',
    });
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(
      { id: 'pi_1', accountId: 'acct_1', amountPence: 4200, metadata: { booking_id: 'book-1', business_id: 'business-1' } },
      'succeeded',
    );
  });

  it('leaves the event to Stripe, which sends its own', async () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue(charged());

    await chargeBeforeLessons({ now });

    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('charges in the window it is asked to', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    await chargeBeforeLessons({ withinHours: 48, now });

    expect(rpc).toHaveBeenCalledWith('system_lessons_to_charge', { p_within_hours: 48 });
  });
});

describe('a lesson that cannot be charged (PAY-03, M3-09)', () => {
  const failsBecause = async (reason: string) => {
    expect(await chargeBeforeLessons({ now })).toEqual({ charged: 0, failed: 1 });
    expect(rpc).toHaveBeenLastCalledWith('system_record_charge_failed', { p_booking_id: 'book-1', p_reason: reason });
  };

  it('fails a learner who never saved a card, without asking the provider', async () => {
    rpc.mockResolvedValueOnce({ data: [due({ customer_id: null })], error: null });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    await failsBecause('no_card');
    expect(listSavedCards).not.toHaveBeenCalled();
  });

  it('tells a card that ran out from no card at all', async () => {
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_old', 2025)] });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await failsBecause('expired_card');

    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [] });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await failsBecause('no_card');
    expect(chargeSavedMethod).not.toHaveBeenCalled();
  });

  it('writes down a refused card', async () => {
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'Declined.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    await failsBecause('declined');
  });

  it('writes down a bank that wants its customer to confirm, however it says so', async () => {
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'AUTHENTICATION_REQUIRED', message: 'Confirm.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await failsBecause('authentication_required');

    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    chargeSavedMethod.mockResolvedValue(charged('requires_action'));
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await failsBecause('authentication_required');
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('counts a lesson already written down as failed once', async () => {
    rpc.mockResolvedValueOnce({ data: [due({ customer_id: null })], error: null });
    rpc.mockResolvedValueOnce({ data: false, error: null });

    expect(await chargeBeforeLessons({ now })).toEqual({ charged: 0, failed: 0 });
  });

  it('decides nothing while the provider cannot be reached, so the next run tries again', async () => {
    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });
    await expect(chargeBeforeLessons({ now })).rejects.toThrow("Could not read a learner's cards");

    rpc.mockResolvedValueOnce({ data: [due()], error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });
    await expect(chargeBeforeLessons({ now })).rejects.toThrow('Could not charge a lesson');

    expect(rpc).not.toHaveBeenCalledWith('system_record_charge_failed', expect.anything());
  });

  it('fails loudly when it cannot read what is due', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

    await expect(chargeBeforeLessons({ now })).rejects.toThrow('Could not read the lessons to charge');
  });
});
