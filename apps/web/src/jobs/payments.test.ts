import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const cancelHold = vi.fn();
const refund = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ cancelHold, refund }) }));

const { cancelExpiredHold, sendRefund } = await import('./payments');

const attempt = (n: number) => ({
  payment_id: `pay-${String(n)}`,
  account_id: 'acct_1',
  intent_id: `pi_${String(n)}`,
});

const waiting = {
  refund_id: 'ref-1',
  status: 'pending',
  kind: 'card',
  amount_pence: 4200,
  account_id: 'acct_1',
  intent_id: 'pi_1',
  booking_id: 'book-1',
  learner_id: 'learner-1',
};

beforeEach(() => {
  rpc.mockReset();
  cancelHold.mockReset();
  refund.mockReset();
});

describe('calling off the payment behind a hold that ran out (R-10, D-274)', () => {
  it('calls off every attempt the expired booking still has open', async () => {
    rpc.mockResolvedValueOnce({ data: [attempt(1), attempt(2)], error: null });
    cancelHold.mockResolvedValue({ ok: true, data: { id: 'pi_1' } });
    rpc.mockResolvedValue({ data: true, error: null });

    expect(await cancelExpiredHold('book-1')).toEqual({ cancelled: 2 });
    expect(rpc).toHaveBeenCalledWith('system_hold_cancellations', { p_booking_id: 'book-1' });
    expect(cancelHold).toHaveBeenCalledWith({ accountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(rpc).toHaveBeenCalledWith('system_record_payment_cancelled', { p_payment_id: 'pay-2' });
  });

  it('leaves an attempt that will not cancel alone, because it has already gone through', async () => {
    rpc.mockResolvedValueOnce({ data: [attempt(1)], error: null });
    cancelHold.mockResolvedValue({ ok: false, reason: 'DECLINED', message: 'That payment has already been taken.' });

    expect(await cancelExpiredHold('book-1')).toEqual({ cancelled: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('throws when the provider cannot be reached, so the runner tries again', async () => {
    rpc.mockResolvedValueOnce({ data: [attempt(1)], error: null });
    cancelHold.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Timed out.' });

    await expect(cancelExpiredHold('book-1')).rejects.toThrow('Could not reach the payment provider: Timed out.');
  });

  it('talks to nobody when nothing is open', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    expect(await cancelExpiredHold('book-1')).toEqual({ cancelled: 0 });
    expect(cancelHold).not.toHaveBeenCalled();
  });

  it('fails loudly when the database cannot be read, so the run is retried', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

    await expect(cancelExpiredHold('book-1')).rejects.toThrow('Could not read the holds to call off');
  });
});

describe('sending a refund the database decided on (PAY-07, M3-06)', () => {
  it('sends it under a key of its own and writes down what came back', async () => {
    rpc.mockResolvedValueOnce({ data: waiting, error: null });
    refund.mockResolvedValue({ ok: true, data: { id: 're_1', paymentIntentId: 'pi_1', amountPence: 4200, status: 'succeeded' } });
    rpc.mockResolvedValueOnce({ data: { applied: true, status: 'succeeded' }, error: null });

    expect(await sendRefund('ref-1')).toEqual({ sent: true });
    expect(refund).toHaveBeenCalledWith({
      accountId: 'acct_1',
      paymentIntentId: 'pi_1',
      amountPence: 4200,
      reason: 'requested_by_customer',
      // The provider's events about it carry this back, so the webhook finds it (M3-17).
      metadata: { refund_id: 'ref-1' },
      idempotencyKey: 'refund:ref-1',
    });
    expect(rpc).toHaveBeenLastCalledWith('system_settle_refund', {
      p_refund_id: 'ref-1',
      p_provider_ref: 're_1',
      p_status: 'succeeded',
    });
  });

  it('keeps the provider’s own word for a refund that is on its way', async () => {
    rpc.mockResolvedValueOnce({ data: waiting, error: null });
    refund.mockResolvedValue({ ok: true, data: { id: 're_2', paymentIntentId: 'pi_1', amountPence: 4200, status: 'canceled' } });
    rpc.mockResolvedValueOnce({ data: { applied: true }, error: null });

    await sendRefund('ref-1');

    expect(rpc).toHaveBeenLastCalledWith('system_settle_refund', {
      p_refund_id: 'ref-1',
      p_provider_ref: 're_2',
      p_status: 'cancelled',
    });
  });

  it('sends nothing twice', async () => {
    rpc.mockResolvedValueOnce({ data: { ...waiting, status: 'succeeded' }, error: null });

    expect(await sendRefund('ref-1')).toEqual({ sent: false, reason: 'That refund has already been settled.' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('leaves credit to the ledger', async () => {
    rpc.mockResolvedValueOnce({ data: { ...waiting, kind: 'credit' }, error: null });

    expect(await sendRefund('ref-1')).toEqual({ sent: false, reason: 'That refund is not a card refund.' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('says so when there is no refund to send', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    expect(await sendRefund('ref-1')).toEqual({ sent: false, reason: 'There is no such refund.' });
  });

  it('fails loudly when the provider refuses, so the money still owed is tried again', async () => {
    rpc.mockResolvedValueOnce({ data: waiting, error: null });
    refund.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Stripe is down.' });

    await expect(sendRefund('ref-1')).rejects.toThrow('The provider would not send the refund');
  });
});
