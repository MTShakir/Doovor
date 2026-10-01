import { plans } from '@repo/config/plans';
import { describe, expect, it } from 'vitest';
import { billingContract } from './contract.ts';
import { createFakeBillingProvider } from './fake.ts';

billingContract('the billing provider that takes no money', createFakeBillingProvider);

/**
 * The parts of the fake that are not in the contract, because a real provider has no equivalent:
 * where it sends the browser, and putting an event back together after it has been through JSON.
 */
describe('the fake on its own (D-231)', () => {
  const business = 'b5f2a0c4-31d8-4a77-8a1f-2e9c0d5b7a13';

  const subscribe = async (billing: ReturnType<typeof createFakeBillingProvider>) => {
    const customer = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });
    if (!customer.ok) throw new Error(customer.message);
    const started = await billing.startCheckout({
      customerId: customer.data.customerId,
      interval: 'month',
      unitAmountPence: plans.pro.monthlyPricePence,
      creditPence: 0,
      successUrl: 'https://app.test/plan',
      cancelUrl: 'https://app.test/plan',
      businessId: business,
    });
    if (!started.ok) throw new Error(started.message);
    return started.data;
  };

  it('sends the browser where it was told to, and to the success page when it was not', async () => {
    const plain = await subscribe(createFakeBillingProvider());
    expect(plain.url).toBe(`https://app.test/plan?session=${plain.sessionId}`);

    const ours = await subscribe(
      createFakeBillingProvider({
        checkoutUrl: ({ sessionId, successUrl }) => `https://app.test/dev/subscribe?s=${sessionId}&to=${successUrl}`,
      }),
    );
    expect(ours.url).toBe(`https://app.test/dev/subscribe?s=${ours.sessionId}&to=https://app.test/plan`);
  });

  it('answers with dates, whether the event arrived with dates or with text', async () => {
    const billing = createFakeBillingProvider();
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'invoice.paid',
      subscription: {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        interval: 'month',
        unitAmountPence: 1_200,
        currentPeriodEnd: '2026-12-31T09:00:00.000Z',
        cancelAtPeriodEnd: false,
        metadata: {},
      },
      invoice: { id: 'in_1', subscriptionId: 'sub_1', paidPence: 0, creditAppliedPence: 1_200, paidAt: '2026-10-01T09:00:00.000Z' },
    });

    const answer = await billing.verifyWebhook({ body, signature: 'fake-signature', secret: 'whsec' });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data.subscription?.currentPeriodEnd).toEqual(new Date('2026-12-31T09:00:00.000Z'));
    expect(answer.data.invoice?.paidAt).toEqual(new Date('2026-10-01T09:00:00.000Z'));
  });

  it('treats a date it cannot read as no date, and a missing paid-at as now', async () => {
    const billing = createFakeBillingProvider();
    const body = JSON.stringify({
      id: 'evt_2',
      type: 'invoice.paid',
      subscription: {
        id: 'sub_2',
        customerId: 'cus_1',
        status: 'active',
        interval: 'month',
        unitAmountPence: 1_200,
        currentPeriodEnd: 'the first of never',
        cancelAtPeriodEnd: false,
        metadata: {},
      },
      invoice: { id: 'in_2', subscriptionId: 'sub_2', paidPence: 1_200, creditAppliedPence: 0, paidAt: null },
    });

    const answer = await billing.verifyWebhook({ body, signature: 'fake-signature', secret: 'whsec' });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // A period end nobody can read is no period end, rather than 1970.
    expect(answer.data.subscription?.currentPeriodEnd).toBeNull();
    expect(answer.data.invoice?.paidAt.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('leaves an event carrying neither a subscription nor an invoice alone', async () => {
    const billing = createFakeBillingProvider();
    const body = JSON.stringify({ id: 'evt_3', type: 'customer.updated', subscription: null, invoice: null });

    const answer = await billing.verifyWebhook({ body, signature: 'fake-signature', secret: 'whsec' });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data).toMatchObject({ id: 'evt_3', subscription: null, invoice: null });
  });

  it('keeps a date that was already a date', async () => {
    const billing = createFakeBillingProvider();
    const { sessionId } = await subscribe(billing);
    const done = billing.finishCheckout(sessionId);

    // Straight out of the fake, nothing has been through JSON, so these are Dates already.
    expect(done?.invoice.paidAt).toBeInstanceOf(Date);
    expect(done?.subscription.currentPeriodEnd).toBeInstanceOf(Date);
  });
});
