import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { stripeApiVersion, stripePaymentsProvider } from './stripe.ts';

/**
 * The Stripe provider without Stripe: a stand-in client records what it was asked for and
 * answers with the shapes the real one does. What is being checked is the part we wrote, which
 * is the mapping in both directions and the account every call has to carry (D-011).
 *
 * The provider is also run against Stripe test mode in M3-23, where the real shapes are proved.
 */

interface Recorded {
  method: string;
  args: unknown[];
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
    accounts: {
      create: record('accounts.create', { id: 'acct_1' }),
      retrieve: record('accounts.retrieve', {
        id: 'acct_1',
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        requirements: { currently_due: ['external_account'], past_due: ['external_account', 'tos_acceptance'] },
      }),
    },
    accountLinks: {
      create: record('accountLinks.create', { url: 'https://connect.stripe.test/setup', expires_at: 1_800_000_000 }),
    },
    customers: {
      search: record('customers.search', { data: [] }),
      create: record('customers.create', { id: 'cus_1' }),
    },
    paymentMethods: {
      list: record('paymentMethods.list', {
        data: [
          { id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030 } },
          { id: 'pm_2', card: null },
        ],
      }),
      detach: record('paymentMethods.detach', { id: 'pm_1' }),
    },
    paymentIntents: {
      create: record('paymentIntents.create', {
        id: 'pi_1',
        status: 'requires_payment_method',
        amount: 4200,
        currency: 'gbp',
        client_secret: 'pi_1_secret',
        metadata: { booking_id: 'booking-1' },
        latest_charge: null,
      }),
      retrieve: record('paymentIntents.retrieve', {
        id: 'pi_1',
        status: 'succeeded',
        amount: 4200,
        currency: 'gbp',
        client_secret: null,
        metadata: {},
        latest_charge: { id: 'ch_1' },
      }),
      capture: record('paymentIntents.capture', {
        id: 'pi_1',
        status: 'succeeded',
        amount: 4200,
        currency: 'gbp',
        client_secret: null,
        metadata: {},
        latest_charge: 'ch_1',
      }),
      cancel: record('paymentIntents.cancel', {
        id: 'pi_1',
        status: 'canceled',
        amount: 4200,
        currency: 'gbp',
        client_secret: null,
        metadata: {},
        latest_charge: null,
      }),
    },
    refunds: {
      create: record('refunds.create', { id: 're_1', amount: 2100, status: 'succeeded' }),
    },
    webhooks: {
      constructEventAsync: record('webhooks.constructEventAsync', {
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        account: 'acct_1',
        created: 1_789_000_000,
        data: { object: { id: 'pi_1' } },
      }),
    },
  };

  // One cast, because a stand-in only has to answer the handful of calls this provider makes.
  return { calls, client: client as unknown as Stripe };
}

const provider = (answers?: Record<string, unknown>) => {
  const { calls, client } = stubStripe(answers);
  return { calls, payments: stripePaymentsProvider({ secretKey: 'sk_test', client }) };
};

describe('with no key at all', () => {
  it('says it is not set up rather than throwing', async () => {
    const payments = stripePaymentsProvider({ secretKey: undefined });

    const account = await payments.getAccount('acct_1');
    expect(account.ok).toBe(false);
    if (!account.ok) expect(account.reason).toBe('NOT_CONFIGURED');

    const intent = await payments.createCheckoutIntent({ accountId: 'acct_1', amountPence: 4200 });
    expect(intent.ok).toBe(false);
  });

  it('is pinned to the version this code was written against', () => {
    expect(stripeApiVersion).toBe('2026-08-26.dahlia');
  });
});

describe('connecting a Business (PAY-01)', () => {
  it('makes an Express account in the country the Business is in', async () => {
    const { calls, payments } = provider();

    const made = await payments.createAccount({ businessName: 'Sarah Khan Driving', email: 'sarah@example.test' });

    expect(made.ok && made.data.accountId).toBe('acct_1');
    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.type).toBe('express');
    expect(body.country).toBe('GB');
    expect(body.business_profile).toEqual({ name: 'Sarah Khan Driving' });
  });

  it('sends them to Stripe and back again', async () => {
    const { calls, payments } = provider();

    const link = await payments.createAccountLink({
      accountId: 'acct_1',
      returnUrl: 'https://app.test/done',
      refreshUrl: 'https://app.test/again',
    });

    expect(link.ok && link.data.url).toBe('https://connect.stripe.test/setup');
    expect(link.ok && link.data.expiresAt.getTime()).toBe(1_800_000_000_000);
    expect(calls[0]?.args[0]).toMatchObject({ type: 'account_onboarding', account: 'acct_1' });
  });

  it('says what Stripe is still waiting for, without saying it twice', async () => {
    const { payments } = provider();
    const state = await payments.getAccount('acct_1');

    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.data.chargesEnabled).toBe(true);
    expect(state.data.payoutsEnabled).toBe(false);
    expect(state.data.requirements).toEqual(['external_account', 'tos_acceptance']);
  });
});

describe('every call carries the account it is for (D-011)', () => {
  it('creates customers, cards and payments on the connected account', async () => {
    const { calls, payments } = provider();
    const account = 'acct_business';

    await payments.ensureCustomer({ accountId: account, reference: 'learner-1' });
    await payments.listSavedCards({ accountId: account, customerId: 'cus_1' });
    await payments.forgetSavedCard({ accountId: account, paymentMethodId: 'pm_1' });
    await payments.createCheckoutIntent({ accountId: account, amountPence: 4200 });
    await payments.getPaymentIntent({ accountId: account, paymentIntentId: 'pi_1' });
    await payments.captureHold({ accountId: account, paymentIntentId: 'pi_1' });
    await payments.cancelHold({ accountId: account, paymentIntentId: 'pi_1' });
    await payments.refund({ accountId: account, paymentIntentId: 'pi_1' });

    const options = calls.map((call) => call.args.at(-1) as { stripeAccount?: string });
    expect(options.every((one) => one.stripeAccount === account)).toBe(true);
  });
});

describe('a learner and their cards (PAY-02)', () => {
  it('uses the customer that is already there', async () => {
    const { calls, payments } = provider({ 'customers.search': { data: [{ id: 'cus_known' }] } });

    const customer = await payments.ensureCustomer({ accountId: 'acct_1', reference: 'learner-1' });

    expect(customer.ok && customer.data.customerId).toBe('cus_known');
    expect(calls.some((call) => call.method === 'customers.create')).toBe(false);
  });

  it('makes one when there is none, and asks for the same one every time', async () => {
    const { calls, payments } = provider();

    const customer = await payments.ensureCustomer({
      accountId: 'acct_1',
      reference: 'learner-1',
      email: 'jack@example.test',
      name: 'Jack Taylor',
    });

    expect(customer.ok && customer.data.customerId).toBe('cus_1');
    const create = calls.find((call) => call.method === 'customers.create');
    expect(create?.args[0]).toMatchObject({ metadata: { reference: 'learner-1' } });
    expect((create?.args[1] as { idempotencyKey?: string }).idempotencyKey).toBe('customer:acct_1:learner-1');
  });

  it('lists only what is really a card', async () => {
    const { payments } = provider();
    const cards = await payments.listSavedCards({ accountId: 'acct_1', customerId: 'cus_1' });

    expect(cards.ok && cards.data).toEqual([
      { paymentMethodId: 'pm_1', brand: 'visa', last4: '4242', expiryMonth: 4, expiryYear: 2030 },
    ]);
  });

  const twice = {
    data: [
      { id: 'pm_new', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030, fingerprint: 'fp_visa' } },
      { id: 'pm_old', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030, fingerprint: 'fp_visa' } },
      { id: 'pm_amex', card: { brand: 'amex', last4: '0005', exp_month: 1, exp_year: 2031, fingerprint: 'fp_amex' } },
    ],
  };

  it('shows a card paid with twice once, the newest copy of it', async () => {
    const { payments } = provider({ 'paymentMethods.list': twice });
    const cards = await payments.listSavedCards({ accountId: 'acct_1', customerId: 'cus_1' });

    expect(cards.ok && cards.data.map((card) => card.paymentMethodId)).toEqual(['pm_new', 'pm_amex']);
  });

  it('forgets every copy of a card, so it does not come back', async () => {
    const { calls, payments } = provider({ 'paymentMethods.list': twice });

    const forgotten = await payments.forgetSavedCard({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_new',
    });

    expect(forgotten.ok).toBe(true);
    const detached = calls.filter((call) => call.method === 'paymentMethods.detach').map((call) => call.args[0]);
    expect(detached).toEqual(['pm_new', 'pm_old']);
  });

  it('removes nothing when the card is not on the customer asking', async () => {
    const { calls, payments } = provider({ 'paymentMethods.list': twice });

    const forgotten = await payments.forgetSavedCard({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_somebody_else',
    });

    expect(forgotten.ok).toBe(false);
    if (!forgotten.ok) expect(forgotten.reason).toBe('NOT_FOUND');
    expect(calls.some((call) => call.method === 'paymentMethods.detach')).toBe(false);
  });

  it('forgets the one card it was given when it is not told whose it is', async () => {
    const { calls, payments } = provider({ 'paymentMethods.list': twice });

    await payments.forgetSavedCard({ accountId: 'acct_1', paymentMethodId: 'pm_old' });

    const detached = calls.filter((call) => call.method === 'paymentMethods.detach').map((call) => call.args[0]);
    expect(detached).toEqual(['pm_old']);
  });
});

describe('taking money (PAY-02, PAY-03, R-12)', () => {
  it('offers card, Apple Pay and Google Pay, and takes it at once by default', async () => {
    const { calls, payments } = provider();

    const intent = await payments.createCheckoutIntent({
      accountId: 'acct_1',
      amountPence: 4200,
      customerId: 'cus_1',
      metadata: { booking_id: 'booking-1' },
      idempotencyKey: 'booking-1:1',
    });

    expect(intent.ok).toBe(true);
    if (intent.ok) {
      expect(intent.data.clientSecret).toBe('pi_1_secret');
      expect(intent.data.metadata.booking_id).toBe('booking-1');
      expect(intent.data.chargeId).toBeNull();
    }
    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.automatic_payment_methods).toEqual({ enabled: true });
    expect(body.capture_method).toBe('automatic');
    expect(body.setup_future_usage).toBeUndefined();
    expect((calls[0]?.args[1] as { idempotencyKey?: string }).idempotencyKey).toBe('booking-1:1');
  });

  it('holds the money for a lesson that has to be accepted, and saves the card when asked', async () => {
    const { calls, payments } = provider();

    await payments.createCheckoutIntent({
      accountId: 'acct_1',
      amountPence: 4200,
      holdOnly: true,
      savePaymentMethod: true,
      statementDescriptor: 'LESSON',
    });

    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.capture_method).toBe('manual');
    expect(body.setup_future_usage).toBe('off_session');
    expect(body.statement_descriptor_suffix).toBe('LESSON');
  });

  it('captures a hold, in part when the price changed', async () => {
    const { calls, payments } = provider();

    const taken = await payments.captureHold({ accountId: 'acct_1', paymentIntentId: 'pi_1', amountPence: 2100 });

    expect(taken.ok && taken.data.status).toBe('succeeded');
    expect(taken.ok && taken.data.chargeId).toBe('ch_1');
    expect(calls[0]?.args[1]).toEqual({ amount_to_capture: 2100 });
  });

  it('lets a hold go', async () => {
    const { payments } = provider();
    const let_go = await payments.cancelHold({ accountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(let_go.ok && let_go.data.status).toBe('canceled');
  });

  it('charges a saved card while nobody is at the keyboard', async () => {
    const { calls, payments } = provider();

    await payments.chargeSavedMethod({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountPence: 4200,
      idempotencyKey: 'lesson-1',
    });

    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.off_session).toBe(true);
    expect(body.confirm).toBe(true);
    expect(body.payment_method).toBe('pm_1');
  });

  it('holds a saved card rather than taking it, for a request (R-12)', async () => {
    const { calls, payments } = provider();

    await payments.chargeSavedMethod({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountPence: 4200,
      holdOnly: true,
      onSession: true,
    });

    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.capture_method).toBe('manual');
  });

  it('tells the bank the learner is there when they are, and offers nothing that redirects (PAY-02)', async () => {
    const { calls, payments } = provider();

    await payments.chargeSavedMethod({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountPence: 4200,
      onSession: true,
    });

    const body = calls[0]?.args[0] as Record<string, unknown>;
    expect(body.off_session).toBeUndefined();
    expect(body.confirm).toBe(true);
    expect(body.automatic_payment_methods).toEqual({ enabled: true, allow_redirects: 'never' });
  });

  it('reads a charge whether Stripe sends its id or the whole thing', async () => {
    const { payments } = provider();
    const read = await payments.getPaymentIntent({ accountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(read.ok && read.data.chargeId).toBe('ch_1');
  });
});

describe('giving it back (PAY-07)', () => {
  it('refunds part of a payment, with the key that stops it happening twice', async () => {
    const { calls, payments } = provider();

    const refund = await payments.refund({
      accountId: 'acct_1',
      paymentIntentId: 'pi_1',
      amountPence: 2100,
      reason: 'requested_by_customer',
      idempotencyKey: 'refund-1',
    });

    expect(refund.ok && refund.data).toEqual({
      id: 're_1',
      paymentIntentId: 'pi_1',
      amountPence: 2100,
      status: 'succeeded',
    });
    expect(calls[0]?.args[0]).toMatchObject({ payment_intent: 'pi_1', amount: 2100, reason: 'requested_by_customer' });
  });

  it('calls anything that is not finished pending', async () => {
    const { payments } = provider({ 'refunds.create': { id: 're_2', amount: 4200, status: 'requires_action' } });
    const refund = await payments.refund({ accountId: 'acct_1', paymentIntentId: 'pi_1' });
    expect(refund.ok && refund.data.status).toBe('pending');
  });
});

describe('when Stripe says no (R-11)', () => {
  const failing = (error: Error) => stripePaymentsProvider({ secretKey: 'sk_test', client: stubStripe({ 'paymentIntents.create': error }).client });

  it('tells a refused card from a bank that wants the cardholder', async () => {
    const declined = new Stripe.errors.StripeCardError({ type: 'card_error', message: 'Your card was declined.' });
    const refused = await failing(declined).chargeSavedMethod({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountPence: 4200,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('DECLINED');

    const needsAuth = new Stripe.errors.StripeCardError({
      type: 'card_error',
      message: 'Authentication required.',
      code: 'authentication_required',
    });
    const asked = await failing(needsAuth).chargeSavedMethod({
      accountId: 'acct_1',
      customerId: 'cus_1',
      paymentMethodId: 'pm_1',
      amountPence: 4200,
    });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.reason).toBe('AUTHENTICATION_REQUIRED');
  });

  it('tells something that is not there from something that is wrong', async () => {
    const missing = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'No such payment_intent.',
      statusCode: 404,
    });
    const gone = await failing(missing).createCheckoutIntent({ accountId: 'acct_1', amountPence: 4200 });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.reason).toBe('NOT_FOUND');

    const wrong = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'Amount must be at least 30p.',
      statusCode: 400,
    });
    const refused = await failing(wrong).createCheckoutIntent({ accountId: 'acct_1', amountPence: 1 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('DECLINED');
  });

  it('treats a key it will not take as not being set up', async () => {
    const bad = new Stripe.errors.StripeAuthenticationError({
      type: 'authentication_error',
      message: 'Invalid API key.',
    });
    const answer = await failing(bad).createCheckoutIntent({ accountId: 'acct_1', amountPence: 4200 });
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('NOT_CONFIGURED');
  });

  it('treats anything else as worth trying again', async () => {
    const down = new Stripe.errors.StripeAPIError({ type: 'api_error', message: 'Something went wrong.' });
    const answer = await failing(down).createCheckoutIntent({ accountId: 'acct_1', amountPence: 4200 });
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('UNAVAILABLE');

    const network = await failing(new Error('socket hang up')).createCheckoutIntent({
      accountId: 'acct_1',
      amountPence: 4200,
    });
    expect(network.ok).toBe(false);
    if (!network.ok) expect(network.message).toBe('socket hang up');
  });
});

describe('events from Stripe (R-11)', () => {
  it('reads one that was signed on the raw body', async () => {
    const { calls, payments } = provider();

    const event = await payments.verifyWebhook({
      body: '{"id":"evt_1"}',
      signature: 't=1,v1=abc',
      secret: 'whsec_test',
    });

    expect(event.ok).toBe(true);
    if (event.ok) {
      expect(event.data.type).toBe('payment_intent.succeeded');
      expect(event.data.accountId).toBe('acct_1');
      expect(event.data.data.id).toBe('pi_1');
    }
    expect(calls[0]?.args[0]).toBe('{"id":"evt_1"}');
  });

  it('refuses one whose signature is not ours', async () => {
    const forged = new Stripe.errors.StripeSignatureVerificationError('t=1,v1=nope', '{}', {
      type: 'invalid_request_error',
      message: 'No signatures found matching the expected signature.',
    });
    const payments = stripePaymentsProvider({
      secretKey: 'sk_test',
      client: stubStripe({ 'webhooks.constructEventAsync': forged }).client,
    });

    const answer = await payments.verifyWebhook({ body: '{}', signature: 'nope', secret: 'whsec_test' });
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.reason).toBe('BAD_SIGNATURE');
  });

  it('reads an event from the platform itself, which has no account', async () => {
    const payments = stripePaymentsProvider({
      secretKey: 'sk_test',
      client: stubStripe({
        'webhooks.constructEventAsync': {
          id: 'evt_2',
          type: 'account.updated',
          created: 1_789_000_000,
          data: { object: { id: 'acct_1' } },
        },
      }).client,
    });

    const event = await payments.verifyWebhook({ body: '{}', signature: 'ok', secret: 'whsec_test' });
    expect(event.ok && event.data.accountId).toBeNull();
  });
});
