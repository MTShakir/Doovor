import { describe, expect, it } from 'vitest';
import { paymentsContract } from './contract.ts';
import { fakeCards, fakePaymentsProvider } from './fake.ts';

describe('the fake provider keeps the contract (M3-01)', () => {
  paymentsContract({
    create: () => fakePaymentsProvider(),
    workingCard: fakeCards.works,
    refusedCard: fakeCards.declined,
  });
});

describe('what the fake adds, for tests to lean on', () => {
  it('holds money rather than taking it, then captures it (R-12)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Held Driving' });
    expect(account.ok).toBe(true);
    if (!account.ok) return;

    const held = await provider.createCheckoutIntent({
      accountId: account.data.accountId,
      amountPence: 4200,
      holdOnly: true,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;

    // A held payment is not money until it is captured, so the fake says what the real one does.
    provider.state.intents.set(held.data.id, { ...held.data, status: 'requires_capture' });

    const taken = await provider.captureHold({
      accountId: account.data.accountId,
      paymentIntentId: held.data.id,
    });
    expect(taken.ok).toBe(true);
    if (taken.ok) {
      expect(taken.data.status).toBe('succeeded');
      expect(taken.data.chargeId).toBeTruthy();
    }
  });

  it('lets a hold go, and will not let one that was taken go (R-12)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Released Driving' });
    if (!account.ok) return;

    const held = await provider.createCheckoutIntent({ accountId: account.data.accountId, amountPence: 4200 });
    if (!held.ok) return;
    provider.state.intents.set(held.data.id, { ...held.data, status: 'requires_capture' });

    const let_go = await provider.cancelHold({
      accountId: account.data.accountId,
      paymentIntentId: held.data.id,
    });
    expect(let_go.ok).toBe(true);
    if (let_go.ok) expect(let_go.data.status).toBe('canceled');

    const customer = await provider.ensureCustomer({ accountId: account.data.accountId, reference: 'learner-1' });
    if (!customer.ok) return;
    const paid = await provider.chargeSavedMethod({
      accountId: account.data.accountId,
      customerId: customer.data.customerId,
      paymentMethodId: fakeCards.works,
      amountPence: 4200,
    });
    if (!paid.ok) return;
    const tooLate = await provider.cancelHold({
      accountId: account.data.accountId,
      paymentIntentId: paid.data.id,
    });
    expect(tooLate.ok).toBe(false);
  });

  it('asks for the cardholder when the bank does (PAY-03)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Authenticated Driving' });
    if (!account.ok) return;
    const customer = await provider.ensureCustomer({ accountId: account.data.accountId, reference: 'learner-1' });
    if (!customer.ok) return;

    const asked = await provider.chargeSavedMethod({
      accountId: account.data.accountId,
      customerId: customer.data.customerId,
      paymentMethodId: fakeCards.authenticationRequired,
      amountPence: 4200,
    });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.reason).toBe('AUTHENTICATION_REQUIRED');
  });

  it('a new account cannot take payments until it is finished (PAY-01)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'New Driving' });
    if (!account.ok) return;

    const state = await provider.getAccount(account.data.accountId);
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.data.chargesEnabled).toBe(false);
      expect(state.data.requirements.length).toBeGreaterThan(0);
    }
  });

  it('reads an event it signed itself, and nothing else (R-11)', async () => {
    const provider = fakePaymentsProvider();
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      account: 'acct_1',
      created: 1_789_000_000,
      data: { object: { id: 'pi_1', amount: 4200 } },
    });

    const read = await provider.verifyWebhook({
      body,
      signature: provider.sign(body, 'whsec_test'),
      secret: 'whsec_test',
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.data.type).toBe('payment_intent.succeeded');
      expect(read.data.accountId).toBe('acct_1');
      expect(read.data.data.id).toBe('pi_1');
    }

    const wrongSecret = await provider.verifyWebhook({
      body,
      signature: provider.sign(body, 'whsec_test'),
      secret: 'whsec_other',
    });
    expect(wrongSecret.ok).toBe(false);
  });

  it('starts again when a test asks it to', async () => {
    const provider = fakePaymentsProvider();
    await provider.createAccount({ businessName: 'Forgotten Driving' });
    provider.reset();
    expect(provider.state.accounts.size).toBe(0);
  });
});

describe('the corners of the fake', () => {
  it('refuses to send anybody to connect an account that is not there', async () => {
    const provider = fakePaymentsProvider();
    const link = await provider.createAccountLink({
      accountId: 'acct_nobody',
      returnUrl: 'https://example.test/done',
      refreshUrl: 'https://example.test/again',
    });
    expect(link.ok).toBe(false);
    if (!link.ok) expect(link.reason).toBe('NOT_FOUND');
  });

  it('can pretend an account is ready, for tests about what comes after', async () => {
    const provider = fakePaymentsProvider({ chargesEnabledAtOnce: true, prefix: 'ready' });
    const account = await provider.createAccount({ businessName: 'Ready Driving', email: 'ready@example.test' });
    if (!account.ok) return;
    expect(account.data.accountId.startsWith('ready_acct_')).toBe(true);

    const state = await provider.getAccount(account.data.accountId);
    if (state.ok) {
      expect(state.data.chargesEnabled).toBe(true);
      expect(state.data.requirements).toEqual([]);
    }
  });

  it('keeps the cards a Business has for somebody, and forgets one on request (PAY-02)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Carded Driving' });
    if (!account.ok) return;
    const customer = await provider.ensureCustomer({ accountId: account.data.accountId, reference: 'learner-1' });
    if (!customer.ok) return;

    const card = { paymentMethodId: 'pm_1', brand: 'visa', last4: '4242', expiryMonth: 4, expiryYear: 2030 };
    provider.state.cards.set(`${account.data.accountId}:${customer.data.customerId}`, [card]);

    const held = await provider.listSavedCards({
      accountId: account.data.accountId,
      customerId: customer.data.customerId,
    });
    expect(held.ok && held.data).toEqual([card]);

    await provider.forgetSavedCard({ accountId: account.data.accountId, paymentMethodId: 'pm_1' });
    const after = await provider.listSavedCards({
      accountId: account.data.accountId,
      customerId: customer.data.customerId,
    });
    expect(after.ok && after.data).toEqual([]);
  });

  it('says so about a payment, a hold or a capture that is not there', async () => {
    const provider = fakePaymentsProvider();
    const missing = { accountId: 'acct_1', paymentIntentId: 'pi_nobody' };

    expect((await provider.getPaymentIntent(missing)).ok).toBe(false);
    expect((await provider.captureHold(missing)).ok).toBe(false);
    expect((await provider.cancelHold(missing)).ok).toBe(false);
  });

  it('will not capture a payment that was never held', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Uncaptured Driving' });
    if (!account.ok) return;
    const intent = await provider.createCheckoutIntent({ accountId: account.data.accountId, amountPence: 4200 });
    if (!intent.ok) return;

    const early = await provider.captureHold({
      accountId: account.data.accountId,
      paymentIntentId: intent.data.id,
    });
    expect(early.ok).toBe(false);
  });

  it('gives all of it back when no amount is named, and nothing twice (PAY-07)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Refunded Driving' });
    if (!account.ok) return;
    const customer = await provider.ensureCustomer({ accountId: account.data.accountId, reference: 'learner-1' });
    if (!customer.ok) return;
    const paid = await provider.chargeSavedMethod({
      accountId: account.data.accountId,
      customerId: customer.data.customerId,
      paymentMethodId: fakeCards.works,
      amountPence: 4200,
    });
    if (!paid.ok) return;

    const all = await provider.refund({ accountId: account.data.accountId, paymentIntentId: paid.data.id });
    expect(all.ok && all.data.amountPence).toBe(4200);

    const again = await provider.refund({ accountId: account.data.accountId, paymentIntentId: paid.data.id });
    expect(again.ok).toBe(false);
  });

  it('will not give back a payment that was never taken', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Unpaid Driving' });
    if (!account.ok) return;
    const intent = await provider.createCheckoutIntent({ accountId: account.data.accountId, amountPence: 4200 });
    if (!intent.ok) return;

    const nothing = await provider.refund({
      accountId: account.data.accountId,
      paymentIntentId: intent.data.id,
    });
    expect(nothing.ok).toBe(false);
  });

  it('charges the same card once for one key, however often a job retries (R-11)', async () => {
    const provider = fakePaymentsProvider();
    const account = await provider.createAccount({ businessName: 'Retried Driving' });
    if (!account.ok) return;
    const customer = await provider.ensureCustomer({ accountId: account.data.accountId, reference: 'learner-1' });
    if (!customer.ok) return;

    const charge = () =>
      provider.chargeSavedMethod({
        accountId: account.data.accountId,
        customerId: customer.data.customerId,
        paymentMethodId: fakeCards.works,
        amountPence: 4200,
        idempotencyKey: 'lesson-1',
      });

    const first = await charge();
    const second = await charge();
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.data.id).toBe(first.data.id);
    expect(provider.state.intents.size).toBe(1);
  });

  it('will not read an event that is not an event (R-11)', async () => {
    const provider = fakePaymentsProvider();
    const body = 'this is not json';
    const read = await provider.verifyWebhook({
      body,
      signature: provider.sign(body, 'whsec_test'),
      secret: 'whsec_test',
    });
    expect(read.ok).toBe(false);
  });

  it('makes an event for a test to hand to the webhook route', () => {
    const provider = fakePaymentsProvider();
    const event = provider.event('payment_intent.succeeded', { id: 'pi_1' }, 'acct_1');
    expect(event.type).toBe('payment_intent.succeeded');
    expect(event.accountId).toBe('acct_1');
    expect(provider.event('account.updated', {}).accountId).toBeNull();
  });
});
