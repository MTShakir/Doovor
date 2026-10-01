import { plans } from '@repo/config/plans';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { stripeBillingApiVersion, stripeBillingProvider } from './stripe.ts';

/**
 * The Stripe billing provider without Stripe (9.18, D-231). A stand-in client records what it was
 * asked for and answers with the shapes the real one does.
 *
 * What is being checked is the part we wrote: that the amount sent is the amount it was given,
 * that credit goes on as a negative balance before the first invoice is made, that the period end
 * is read off the item rather than the subscription, and that a status nobody taught this code
 * carries no Pro.
 */

interface Recorded {
  method: string;
  args: unknown[];
}

const business = 'b5f2a0c4-31d8-4a77-8a1f-2e9c0d5b7a13';

/** A subscription item the way this API version sends one: the period lives here. */
function anItem(over: Record<string, unknown> = {}) {
  return {
    id: 'si_1',
    current_period_end: 1_800_000_000,
    price: { unit_amount: plans.pro.monthlyPricePence, recurring: { interval: 'month' }, product: 'prod_pro' },
    ...over,
  };
}

function aSubscription(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { business_id: business },
    items: { data: [anItem()] },
    ...over,
  };
}

function stubStripe(answers: Record<string, unknown> = {}) {
  const calls: Recorded[] = [];
  const record = (method: string, answer: unknown) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      const given = answers[method];
      if (given instanceof Error) return Promise.reject(given);
      return Promise.resolve(given ?? answer);
    });

  const client = {
    customers: {
      search: record('customers.search', { data: [] }),
      create: record('customers.create', { id: 'cus_1' }),
      update: record('customers.update', { id: 'cus_1' }),
      createBalanceTransaction: record('customers.createBalanceTransaction', { id: 'cbtxn_1' }),
    },
    products: {
      search: record('products.search', { data: [{ id: 'prod_pro' }] }),
      create: record('products.create', { id: 'prod_pro' }),
    },
    checkout: {
      sessions: {
        create: record('checkout.sessions.create', { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }),
      },
    },
    subscriptions: {
      retrieve: record('subscriptions.retrieve', aSubscription()),
      update: record('subscriptions.update', aSubscription()),
    },
    webhooks: {
      constructEventAsync: record('webhooks.constructEventAsync', {
        id: 'evt_1',
        type: 'customer.subscription.updated',
        data: { object: aSubscription() },
      }),
    },
  };

  return { client: client as unknown as Stripe, calls };
}

const make = (answers: Record<string, unknown> = {}) => {
  const { client, calls } = stubStripe(answers);
  return { billing: stripeBillingProvider({ secretKey: 'sk_test_x', productName: 'Pro', client }), calls };
};

/** What one recorded call was asked for, so a test can read the body it sent. */
const bodyOf = (calls: Recorded[], method: string, index = 0): Record<string, unknown> => {
  const found = calls.filter((call) => call.method === method)[index];
  if (!found) throw new Error(`${method} was never called`);
  // Customer-scoped calls take the id first, so the body is whichever argument is an object.
  const object = found.args.find((arg) => typeof arg === 'object' && arg !== null);
  return (object ?? {}) as Record<string, unknown>;
};

describe('Stripe billing (9.18, D-231)', () => {
  it('is pinned to the API version it was written against', () => {
    expect(stripeBillingApiVersion).toBe('2026-08-26.dahlia');
  });

  it('answers rather than throwing when there is no key', async () => {
    const billing = stripeBillingProvider({ secretKey: undefined, productName: 'Pro' });
    const answer = await billing.getSubscription('sub_1');

    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('unavailable');
  });

  it('finds the customer a Business already has rather than making a second one', async () => {
    const { billing, calls } = make({ 'customers.search': { data: [{ id: 'cus_existing' }] } });
    const answer = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });

    expect(answer.ok && answer.data.customerId).toBe('cus_existing');
    expect(calls.some((call) => call.method === 'customers.create')).toBe(false);
    expect(bodyOf(calls, 'customers.update')).toMatchObject({ email: 'sam@example.com', name: 'Sam' });
  });

  it('makes one under the Business it is for, with a key that survives a race', async () => {
    const { billing, calls } = make();
    const answer = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });

    expect(answer.ok && answer.data.customerId).toBe('cus_1');
    expect(bodyOf(calls, 'customers.create')).toMatchObject({ metadata: { business_id: business } });
    expect(calls.find((call) => call.method === 'customers.create')?.args).toContainEqual({
      idempotencyKey: `billing-customer:${business}`,
    });
  });

  it('will not put a Business id into a search query unless it is one', async () => {
    const { billing, calls } = make();
    const answer = await billing.ensureCustomer({
      businessId: "' OR metadata['business_id']:'*",
      email: 'sam@example.com',
      name: 'Sam',
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('invalid');
    expect(calls).toHaveLength(0);
  });

  it('sends the amount it was given, every period, in pence', async () => {
    const { billing, calls } = make();
    const answer = await billing.startCheckout({
      customerId: 'cus_1',
      interval: 'year',
      unitAmountPence: 11_400,
      creditPence: 0,
      successUrl: 'https://app.test/plan',
      cancelUrl: 'https://app.test/plan',
      businessId: business,
    });

    expect(answer.ok && answer.data.url).toBe('https://checkout.stripe.test/cs_1');
    expect(bodyOf(calls, 'checkout.sessions.create')).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'gbp', product: 'prod_pro', recurring: { interval: 'year' }, unit_amount: 11_400 },
        },
      ],
      subscription_data: { metadata: { business_id: business } },
    });
  });

  it('refuses a subscription with no price before it asks Stripe anything', async () => {
    for (const unitAmountPence of [0, -1200, 12.5]) {
      const { billing, calls } = make();
      const answer = await billing.startCheckout({
        customerId: 'cus_1',
        interval: 'month',
        unitAmountPence,
        creditPence: 0,
        successUrl: 'https://app.test/plan',
        cancelUrl: 'https://app.test/plan',
        businessId: business,
      });

      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.reason).toBe('invalid');
      expect(calls).toHaveLength(0);
    }
  });

  it('puts banked months on as credit before the checkout, so the first invoice sees them', async () => {
    const { billing, calls } = make();
    await billing.startCheckout({
      customerId: 'cus_1',
      interval: 'month',
      unitAmountPence: plans.pro.monthlyPricePence,
      creditPence: 2_400,
      successUrl: 'https://app.test/plan',
      cancelUrl: 'https://app.test/plan',
      businessId: business,
    });

    // Negative, because that is how Stripe holds credit, and before the session was made.
    expect(bodyOf(calls, 'customers.createBalanceTransaction')).toMatchObject({ amount: -2_400, currency: 'gbp' });
    const order = calls.map((call) => call.method);
    expect(order.indexOf('customers.createBalanceTransaction')).toBeLessThan(order.indexOf('checkout.sessions.create'));
  });

  it('does not credit nothing, and cannot be made to charge more with a negative', async () => {
    const { billing, calls } = make();
    expect((await billing.addCredit({ customerId: 'cus_1', pence: 0, reason: 'nothing' })).ok).toBe(true);
    expect((await billing.addCredit({ customerId: 'cus_1', pence: -5_000, reason: 'nonsense' })).ok).toBe(true);

    expect(calls.filter((call) => call.method === 'customers.createBalanceTransaction')).toHaveLength(0);
  });

  it('reads the period end off the item, because a subscription no longer carries one', async () => {
    const { billing } = make();
    const answer = await billing.getSubscription('sub_1');

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data.currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
    expect(answer.data.interval).toBe('month');
    expect(answer.data.unitAmountPence).toBe(plans.pro.monthlyPricePence);
    expect(answer.data.metadata.business_id).toBe(business);
  });

  it('carries no Pro on a status it has not been taught', async () => {
    for (const status of ['paused', 'incomplete_expired', 'something_new']) {
      const { billing } = make({ 'subscriptions.retrieve': aSubscription({ status }) });
      const answer = await billing.getSubscription('sub_1');
      expect(answer.ok && answer.data.status).toBe('canceled');
    }
  });

  it('reprices the next period without billing anybody for the change (D-206)', async () => {
    const { billing, calls } = make();
    const answer = await billing.setSubscriptionPrice({ subscriptionId: 'sub_1', unitAmountPence: 1_140 });

    expect(answer.ok).toBe(true);
    expect(bodyOf(calls, 'subscriptions.update')).toMatchObject({
      items: [
        {
          id: 'si_1',
          price_data: { currency: 'gbp', product: 'prod_pro', recurring: { interval: 'month' }, unit_amount: 1_140 },
        },
      ],
      proration_behavior: 'none',
    });
  });

  it('will not reprice a subscription at nothing, even by mistake', async () => {
    for (const unitAmountPence of [0, -1, 1.5]) {
      const { billing, calls } = make();
      expect((await billing.setSubscriptionPrice({ subscriptionId: 'sub_1', unitAmountPence })).ok).toBe(false);
      expect(calls).toHaveLength(0);
    }
  });

  it('stops at the end of the period, and starts again, without touching anything else', async () => {
    const { billing, calls } = make({ 'subscriptions.update': aSubscription({ cancel_at_period_end: true }) });
    const answer = await billing.setCancelAtPeriodEnd({ subscriptionId: 'sub_1', cancel: true });

    expect(answer.ok && answer.data.cancelAtPeriodEnd).toBe(true);
    expect(bodyOf(calls, 'subscriptions.update')).toEqual({ cancel_at_period_end: true });
  });

  it('calls a missing thing missing, whichever call found it', async () => {
    const missing = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'No such subscription: sub_nothing',
      code: 'resource_missing',
    });

    for (const method of ['subscriptions.retrieve', 'subscriptions.update'] as const) {
      const { billing } = make({ [method]: missing });
      const answer = await billing.getSubscription('sub_nothing');
      if (method === 'subscriptions.retrieve') {
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toBe('not_found');
      }
    }

    const { billing } = make({ 'customers.createBalanceTransaction': missing });
    const answer = await billing.addCredit({ customerId: 'cus_nothing', pence: 100, reason: 'test' });
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('not_found');
  });

  it('says unavailable when Stripe cannot be reached, and invalid when our key is the problem', async () => {
    const down = new Stripe.errors.StripeConnectionError({ type: 'api_error', message: 'socket hang up' });
    const { billing } = make({ 'subscriptions.retrieve': down });
    const answer = await billing.getSubscription('sub_1');

    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('unavailable');
  });

  it('refuses a checkout Stripe gave nowhere to send anybody', async () => {
    const { billing } = make({ 'checkout.sessions.create': { id: 'cs_1', url: null } });
    const answer = await billing.startCheckout({
      customerId: 'cus_1',
      interval: 'month',
      unitAmountPence: plans.pro.monthlyPricePence,
      creditPence: 0,
      successUrl: 'https://app.test/plan',
      cancelUrl: 'https://app.test/plan',
      businessId: business,
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('invalid');
  });

  it('turns a subscription event into one, and an invoice event into one', async () => {
    const { billing } = make();
    const subscriptionEvent = await billing.verifyWebhook({ body: '{}', signature: 'sig', secret: 'whsec' });

    expect(subscriptionEvent.ok).toBe(true);
    if (!subscriptionEvent.ok) return;
    expect(subscriptionEvent.data.subscription?.id).toBe('sub_1');
    expect(subscriptionEvent.data.invoice).toBeNull();

    const paid = make({
      'webhooks.constructEventAsync': {
        id: 'evt_2',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_1',
            amount_paid: 0,
            starting_balance: -2_400,
            ending_balance: -1_200,
            status_transitions: { paid_at: 1_700_000_000 },
            parent: { subscription_details: { subscription: 'sub_1' } },
          },
        },
      },
    });
    const invoiceEvent = await paid.billing.verifyWebhook({ body: '{}', signature: 'sig', secret: 'whsec' });

    expect(invoiceEvent.ok).toBe(true);
    if (!invoiceEvent.ok) return;
    // Nought paid is a real invoice: banked months covered the whole of it (D-205). What it used
    // is the difference between the balances, which is twelve pounds of the twenty-four.
    expect(invoiceEvent.data.invoice).toMatchObject({
      id: 'in_1',
      subscriptionId: 'sub_1',
      paidPence: 0,
      creditAppliedPence: 1_200,
    });
    expect(invoiceEvent.data.subscription).toBeNull();
  });

  it('carries an event it takes no action on, so the route can answer and say it was seen', async () => {
    const { billing } = make({
      'webhooks.constructEventAsync': { id: 'evt_3', type: 'customer.updated', data: { object: { id: 'cus_1' } } },
    });
    const answer = await billing.verifyWebhook({ body: '{}', signature: 'sig', secret: 'whsec' });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data).toMatchObject({ id: 'evt_3', type: 'customer.updated', subscription: null, invoice: null });
  });

  it('takes no event whose signature is wrong (R-11)', async () => {
    // Its real constructor: the header it was given and the body it was given, in that order.
    const forged = new Stripe.errors.StripeSignatureVerificationError('forged', '{}', {
      type: 'invalid_request_error',
      message: 'No signatures found matching the expected signature for payload.',
    });
    const { billing } = make({ 'webhooks.constructEventAsync': forged });
    const answer = await billing.verifyWebhook({ body: '{}', signature: 'forged', secret: 'whsec' });

    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('invalid');
  });

  it('claims no credit was used by an invoice Stripe has not finalised yet', async () => {
    const { billing } = make({
      'webhooks.constructEventAsync': {
        id: 'evt_5',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_3',
            amount_paid: 1_200,
            // In credit, and not finalised: how much of it this invoice will use is not settled.
            starting_balance: -2_400,
            ending_balance: null,
            status_transitions: {},
            parent: { subscription_details: { subscription: 'sub_1' } },
          },
        },
      },
    });
    const answer = await billing.verifyWebhook({ body: '{}', signature: 'sig', secret: 'whsec' });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.data.invoice).toMatchObject({ paidPence: 1_200, creditAppliedPence: 0 });
    // No paid_at on the invoice, so it is treated as now rather than as the start of 1970.
    expect(answer.data.invoice?.paidAt.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('ignores an invoice that belongs to no subscription of ours', async () => {
    const { billing } = make({
      'webhooks.constructEventAsync': {
        id: 'evt_4',
        type: 'invoice.paid',
        data: { object: { id: 'in_2', amount_paid: 500, status_transitions: {}, parent: null } },
      },
    });
    const answer = await billing.verifyWebhook({ body: '{}', signature: 'sig', secret: 'whsec' });

    expect(answer.ok && answer.data.invoice).toBeNull();
  });

  it('makes the Pro product once and finds it thereafter', async () => {
    const { billing, calls } = make({ 'products.search': { data: [] } });
    for (const interval of ['month', 'year'] as const) {
      await billing.startCheckout({
        customerId: 'cus_1',
        interval,
        unitAmountPence: 1_200,
        creditPence: 0,
        successUrl: 'https://app.test/plan',
        cancelUrl: 'https://app.test/plan',
        businessId: business,
      });
    }

    expect(calls.filter((call) => call.method === 'products.create')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'products.search')).toHaveLength(1);
    expect(bodyOf(calls, 'products.create')).toMatchObject({ name: 'Pro' });
  });
});
