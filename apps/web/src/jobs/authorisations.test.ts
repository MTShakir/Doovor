import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const captureHold = vi.fn();
const cancelHold = vi.fn();
const deliverFakePaymentEvent = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const env = { PAYMENTS_PROVIDER: 'fake' };

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ captureHold, cancelHold }) }));
vi.mock('@/lib/payments/webhook', () => ({
  deliverFakePaymentEvent: (...args: unknown[]) => deliverFakePaymentEvent(...args),
}));
vi.mock('@/env/server', () => ({ serverEnv: env }));

const { settleAuthorisations } = await import('./authorisations');

const due = (n: number) => ({
  payment_id: `pay-${String(n)}`,
  booking_id: `book-${String(n)}`,
  account_id: 'acct_1',
  intent_id: `pi_${String(n)}`,
  amount_pence: 4200,
});

beforeEach(() => {
  vi.clearAllMocks();
  env.PAYMENTS_PROVIDER = 'fake';
  deliverFakePaymentEvent.mockResolvedValue(true);
});

describe('taking an authorisation for an accepted request (R-12, M3-08)', () => {
  it('captures it under a key of its own, and lets the webhook write it down', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [due(1)], release: [] }, error: null });
    captureHold.mockResolvedValue({ ok: true, data: { id: 'pi_1', amountPence: 4200, status: 'succeeded' } });

    expect(await settleAuthorisations()).toEqual({ captured: 1, released: 0, failed: 0 });
    expect(captureHold).toHaveBeenCalledWith({ accountId: 'acct_1', paymentIntentId: 'pi_1', idempotencyKey: 'capture:pay-1' });
    expect(deliverFakePaymentEvent).toHaveBeenCalledWith(
      { id: 'pi_1', accountId: 'acct_1', amountPence: 4200, metadata: { booking_id: 'book-1' } },
      'succeeded',
    );
  });

  it('sends nothing itself with Stripe, which sends its own event', async () => {
    env.PAYMENTS_PROVIDER = 'stripe';
    rpc.mockResolvedValueOnce({ data: { capture: [due(1)], release: [] }, error: null });
    captureHold.mockResolvedValue({ ok: true, data: { id: 'pi_1', amountPence: 4200, status: 'succeeded' } });

    await settleAuthorisations();

    expect(deliverFakePaymentEvent).not.toHaveBeenCalled();
  });

  it('writes down an authorisation that has gone, so the lesson is owed for instead', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [due(1)], release: [] }, error: null });
    captureHold.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'That payment is not being held.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    expect(await settleAuthorisations()).toEqual({ captured: 0, released: 0, failed: 1 });
    expect(rpc).toHaveBeenLastCalledWith('system_record_capture_failed', { p_payment_id: 'pay-1' });
  });

  it('tries again later when the provider cannot be reached, rather than giving up on the money', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [due(1)], release: [] }, error: null });
    captureHold.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Stripe is down.' });

    await expect(settleAuthorisations()).rejects.toThrow('Could not capture a payment');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('letting go of an authorisation for a request that is not happening (R-12, M3-08)', () => {
  it('releases it and writes that down', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [], release: [due(2)] }, error: null });
    cancelHold.mockResolvedValue({ ok: true, data: { id: 'pi_2', status: 'canceled' } });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    expect(await settleAuthorisations()).toEqual({ captured: 0, released: 1, failed: 0 });
    expect(cancelHold).toHaveBeenCalledWith({ accountId: 'acct_1', paymentIntentId: 'pi_2' });
    expect(rpc).toHaveBeenLastCalledWith('system_record_payment_cancelled', { p_payment_id: 'pay-2' });
  });

  it('counts one already gone at the provider as released', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [], release: [due(2)] }, error: null });
    cancelHold.mockResolvedValue({ ok: false, reason: 'NOT_FOUND', message: 'No such payment.' });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    expect(await settleAuthorisations()).toEqual({ captured: 0, released: 1, failed: 0 });
  });

  it('leaves one that was taken after all to the webhook, which refunds it', async () => {
    rpc.mockResolvedValueOnce({ data: { capture: [], release: [due(2)] }, error: null });
    cancelHold.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'That payment has already been taken.' });

    expect(await settleAuthorisations()).toEqual({ captured: 0, released: 0, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when it cannot read what is due, so the run is retried', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

    await expect(settleAuthorisations()).rejects.toThrow('Could not read the authorisations that are due');
  });
});
