import { plans } from '@repo/config/plans';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const verifyWebhook = vi.fn();
const setSubscriptionPrice = vi.fn();
const cancelAndRefund = vi.fn();
const billingWebhookSecrets = vi.fn<() => string[]>();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/billing/provider', () => ({
  billingProvider: () => ({ verifyWebhook, setSubscriptionPrice, cancelAndRefund }),
  billingWebhookSecrets: () => billingWebhookSecrets(),
  signFakeBillingEvent: () => 'fake-signature',
}));

const { handleBillingEvent } = await import('./webhook');

const anEvent = (over: Record<string, unknown> = {}) => ({
  ok: true,
  data: { id: 'evt_1', type: 'invoice.paid', subscription: null, invoice: null, ...over },
});

const anInvoice = (creditAppliedPence = 0) => ({
  id: 'in_1',
  subscriptionId: 'sub_1',
  paidPence: 1_200,
  creditAppliedPence,
  paidAt: new Date('2026-10-01T09:00:00Z'),
});

const aSubscription = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  customerId: 'cus_1',
  status: 'active',
  interval: 'month',
  unitAmountPence: plans.pro.monthlyPricePence,
  currentPeriodEnd: new Date('2026-11-01T09:00:00Z'),
  cancelAtPeriodEnd: false,
  metadata: {},
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  billingWebhookSecrets.mockReturnValue(['whsec_test']);
  rpc.mockResolvedValue({ data: { applied: true, outcome: 'recorded' }, error: null });
});

describe('events from Stripe Billing (9.18, D-235, D-238)', () => {
  it('takes nothing when there is no secret to check a signature against', async () => {
    billingWebhookSecrets.mockReturnValue([]);

    const answer = await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(answer.status).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an event whose signature does not check out, and applies nothing (R-11)', async () => {
    verifyWebhook.mockResolvedValue({ ok: false, reason: 'invalid', message: 'no' });

    const answer = await handleBillingEvent({ body: '{}', signature: 'forged' });

    expect(answer.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('tries every secret it has before giving up', async () => {
    billingWebhookSecrets.mockReturnValue(['old', 'new']);
    verifyWebhook
      .mockResolvedValueOnce({ ok: false, reason: 'invalid', message: 'no' })
      .mockResolvedValueOnce(anEvent());

    expect((await handleBillingEvent({ body: '{}', signature: 'sig' })).status).toBe(200);
    expect(verifyWebhook).toHaveBeenCalledTimes(2);
  });

  it('asks Stripe to send it again when the database could not take it', async () => {
    verifyWebhook.mockResolvedValue(anEvent());
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });

    expect((await handleBillingEvent({ body: '{}', signature: 'sig' })).status).toBe(500);
  });

  it('sends a subscription as a subscription, with the dates as text', async () => {
    verifyWebhook.mockResolvedValue(
      anEvent({ type: 'customer.subscription.updated', subscription: aSubscription(), invoice: null }),
    );

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(rpc).toHaveBeenCalledWith('system_process_billing_event', {
      p_event_id: 'evt_1',
      p_event_type: 'customer.subscription.updated',
      p_payload: {
        kind: 'subscription',
        subscriptionId: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        interval: 'month',
        periodEnd: '2026-11-01T09:00:00.000Z',
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('calls a deleted subscription cancelled, whatever status it carried out', async () => {
    verifyWebhook.mockResolvedValue(
      anEvent({ type: 'customer.subscription.deleted', subscription: aSubscription({ status: 'active' }) }),
    );

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_payload: { status: 'canceled' } });
  });

  it('turns credit that was used into whole referral months, and never a part of one (D-205)', async () => {
    const monthly = plans.pro.monthlyPricePence;
    for (const [used, months] of [
      [0, 0],
      [monthly - 1, 0],
      [monthly, 1],
      [monthly * 2 + 50, 2],
    ] as const) {
      vi.clearAllMocks();
      rpc.mockResolvedValue({ data: { applied: true, outcome: 'recorded' }, error: null });
      verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice(used) }));

      await handleBillingEvent({ body: '{}', signature: 'sig' });
      expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_payload: { monthsCredited: months } });
    }
  });

  it('never tells the database how many months an invoice covered', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice() }));

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    // That follows from the interval on the row, which only a signed event wrote. A caller that
    // could say "this one was worth twelve months" could buy a loyalty discount.
    const payload = (rpc.mock.calls[0]?.[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect(payload).not.toHaveProperty('monthsCovered');
  });

  it('moves the price down when another three months have earned it (D-206, D-238)', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice() }));
    rpc.mockResolvedValue({
      data: { applied: true, outcome: 'payment_recorded', subscriptionId: 'sub_1', interval: 'month', monthsBefore: 2, monthsAfter: 3 },
      error: null,
    });
    setSubscriptionPrice.mockResolvedValue({ ok: true, data: aSubscription() });

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    // Three months in is the first 5% step, so £12 becomes £11.40.
    expect(setSubscriptionPrice).toHaveBeenCalledWith({ subscriptionId: 'sub_1', unitAmountPence: 1_140 });
  });

  it('leaves the price alone on a month that earned no step', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice() }));
    rpc.mockResolvedValue({
      data: { applied: true, outcome: 'payment_recorded', subscriptionId: 'sub_1', interval: 'month', monthsBefore: 3, monthsAfter: 4 },
      error: null,
    });

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(setSubscriptionPrice).not.toHaveBeenCalled();
  });

  it('does not reprice on a duplicate, which moved no months', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice() }));
    rpc.mockResolvedValue({ data: { applied: false, outcome: 'duplicate' }, error: null });

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(setSubscriptionPrice).not.toHaveBeenCalled();
  });

  it('ends and refunds a second subscription, and records what came back (D-239)', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ type: 'customer.subscription.created', subscription: aSubscription() }));
    rpc.mockResolvedValue({
      data: {
        applied: true,
        outcome: 'duplicate_subscription',
        duplicateSubscriptionId: 'sub_2',
        keptSubscriptionId: 'sub_1',
        customerId: 'cus_1',
        businessId: 'biz-1',
      },
      error: null,
    });
    cancelAndRefund.mockResolvedValue({ ok: true, data: { refundedPence: 1_200, creditRestoredPence: 0 } });

    const answer = await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(answer.status).toBe(200);
    // The duplicate, never the one that was kept.
    expect(cancelAndRefund).toHaveBeenCalledWith({ subscriptionId: 'sub_2', customerId: 'cus_1' });
    expect(rpc).toHaveBeenLastCalledWith('system_record_subscription_refund', {
      p_business_id: 'biz-1',
      p_duplicate_subscription_id: 'sub_2',
      p_refunded_pence: 1_200,
      p_credit_restored_pence: 0,
    });
  });

  it('records nothing when the refund did not happen, so the trail does not claim it did', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ type: 'customer.subscription.created', subscription: aSubscription() }));
    rpc.mockResolvedValue({
      data: {
        applied: true,
        outcome: 'duplicate_subscription',
        duplicateSubscriptionId: 'sub_2',
        keptSubscriptionId: 'sub_1',
        customerId: 'cus_1',
        businessId: 'biz-1',
      },
      error: null,
    });
    cancelAndRefund.mockResolvedValue({ ok: false, reason: 'unavailable', message: 'down' });

    const answer = await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(answer.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('still answers 200 when the refund throws, rather than asking for a second one', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ type: 'customer.subscription.created', subscription: aSubscription() }));
    rpc.mockResolvedValue({
      data: {
        applied: true,
        outcome: 'duplicate_subscription',
        duplicateSubscriptionId: 'sub_2',
        keptSubscriptionId: 'sub_1',
        customerId: 'cus_1',
        businessId: 'biz-1',
      },
      error: null,
    });
    cancelAndRefund.mockRejectedValue(new Error('Stripe is down'));

    // Anything but 200 would have Stripe send the event again and ask for another refund.
    expect((await handleBillingEvent({ body: '{}', signature: 'sig' })).status).toBe(200);
  });

  it('refunds nothing on an ordinary subscription event', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ type: 'customer.subscription.updated', subscription: aSubscription() }));
    rpc.mockResolvedValue({ data: { applied: true, outcome: 'subscription_recorded' }, error: null });

    await handleBillingEvent({ body: '{}', signature: 'sig' });

    expect(cancelAndRefund).not.toHaveBeenCalled();
  });

  it('still answers 200 when the price could not be moved', async () => {
    verifyWebhook.mockResolvedValue(anEvent({ invoice: anInvoice() }));
    rpc.mockResolvedValue({
      data: { applied: true, outcome: 'payment_recorded', subscriptionId: 'sub_1', interval: 'year', monthsBefore: 0, monthsAfter: 12 },
      error: null,
    });
    setSubscriptionPrice.mockRejectedValue(new Error('Stripe is down'));

    // The payment is recorded and the plan is granted. Answering anything else would have Stripe
    // send the whole event again, and the price moves on the next invoice instead.
    expect((await handleBillingEvent({ body: '{}', signature: 'sig' })).status).toBe(200);
  });
});
