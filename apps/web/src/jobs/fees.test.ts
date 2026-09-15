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

const { chargeFee } = await import('./fees');

const now = new Date('2026-09-15T09:00:00Z');

const fee = (overrides: Record<string, unknown> = {}) => ({
  booking_id: 'book-1',
  business_id: 'business-1',
  account_id: 'acct_1',
  customer_id: 'cus_lee',
  amount_pence: 2100,
  kind: 'no_show',
  ...overrides,
});

const card = (id: string, expiryYear = 2030) => ({ paymentMethodId: id, brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear });

const succeeded = {
  ok: true,
  data: {
    id: 'pi_fee',
    status: 'succeeded',
    amountPence: 2100,
    currency: 'gbp',
    clientSecret: null,
    accountId: 'acct_1',
    metadata: { booking_id: 'book-1', business_id: 'business-1', fee: 'no_show' },
    chargeId: 'ch_fee',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  env.PAYMENTS_PROVIDER = 'fake';
  deliverFakePaymentEvent.mockResolvedValue(true);
});

describe('charging a fee to the kept card (PAY-09, M3-19)', () => {
  it('charges the fee, not the lesson, to the newest card that works, once, with nobody there', async () => {
    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_expired', 2025), card('pm_works')] });
    chargeSavedMethod.mockResolvedValue(succeeded);

    expect(await chargeFee('book-1', now)).toEqual({ charged: true });
    expect(rpc).toHaveBeenCalledWith('system_fee_to_charge', { p_booking_id: 'book-1' });
    expect(chargeSavedMethod).toHaveBeenCalledWith({
      accountId: 'acct_1',
      customerId: 'cus_lee',
      paymentMethodId: 'pm_works',
      amountPence: 2100,
      metadata: { booking_id: 'book-1', business_id: 'business-1', fee: 'no_show' },
      idempotencyKey: 'fee:book-1:2100',
    });
    // The fake sends the event Stripe would, so the webhook records the payment as the fee.
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(
      { id: 'pi_fee', accountId: 'acct_1', amountPence: 2100, metadata: { booking_id: 'book-1', business_id: 'business-1', fee: 'no_show' } },
      'succeeded',
    );
  });

  it('does nothing when the fee has been paid some other way meanwhile', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'nothing_to_charge' });
    expect(listSavedCards).not.toHaveBeenCalled();
  });

  it('leaves a fee owed without a word when there is no card to charge', async () => {
    rpc.mockResolvedValueOnce({ data: fee({ customer_id: null }), error: null });
    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'no_card' });

    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [] });
    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'no_card' });

    expect(rpc).not.toHaveBeenCalledWith('system_record_fee_charge_failed', expect.anything());
  });

  it('writes down a card that ran out, was refused or wants its holder, so both sides are told', async () => {
    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_old', 2025)] });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'expired_card' });
    expect(rpc).toHaveBeenLastCalledWith('system_record_fee_charge_failed', { p_booking_id: 'book-1', p_reason: 'expired_card' });

    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'Declined.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'declined' });

    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'AUTHENTICATION_REQUIRED', message: 'Confirm.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await chargeFee('book-1', now)).toEqual({ charged: false, reason: 'authentication_required' });
    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('decides nothing while the provider cannot be reached, so a retry tries again', async () => {
    rpc.mockResolvedValueOnce({ data: fee(), error: null });
    listSavedCards.mockResolvedValue({ ok: true, data: [card('pm_1')] });
    chargeSavedMethod.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });

    await expect(chargeFee('book-1', now)).rejects.toThrow('Could not charge a lesson');
    expect(rpc).not.toHaveBeenCalledWith('system_record_fee_charge_failed', expect.anything());
  });

  it('fails loudly when it cannot read the fee', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    await expect(chargeFee('book-1', now)).rejects.toThrow('Could not read the fee to charge');
  });
});
