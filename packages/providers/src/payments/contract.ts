import { expect, it } from 'vitest';
import type { PaymentsProvider } from './types.ts';

/**
 * What any payments provider has to do (M3-01).
 *
 * One suite, run against the fake now and against Stripe test mode in M3-23. If the two ever
 * answer differently, the fake has stopped being worth testing against, which is the only
 * thing that would make every other test here a lie.
 *
 * Imported only by test files, never by anything that ships.
 */

export interface PaymentsContract {
  create: () => PaymentsProvider | Promise<PaymentsProvider>;
  /** A card the provider will take, in whatever form it names payment methods. */
  workingCard: string;
  /** A card the provider will refuse. */
  refusedCard: string;
  /** An account that can already take payments, when the provider cannot make one. */
  accountId?: string;
}

export function paymentsContract(contract: PaymentsContract): void {
  const ready = async (): Promise<{ provider: PaymentsProvider; accountId: string }> => {
    const provider = await contract.create();
    if (contract.accountId) return { provider, accountId: contract.accountId };

    const made = await provider.createAccount({ businessName: 'Contract Driving' });
    expect(made.ok, 'a provider that makes accounts made one').toBe(true);
    return { provider, accountId: made.ok ? made.data.accountId : '' };
  };

  it('sends somebody off to connect an account, and says what is still missing', async () => {
    const { provider, accountId } = await ready();

    const link = await provider.createAccountLink({
      accountId,
      returnUrl: 'https://example.test/done',
      refreshUrl: 'https://example.test/again',
    });
    expect(link.ok).toBe(true);
    if (link.ok) expect(link.data.url).toMatch(/^https:\/\//);

    const account = await provider.getAccount(accountId);
    expect(account.ok).toBe(true);
    if (account.ok) expect(typeof account.data.chargesEnabled).toBe('boolean');
  });

  it('says so rather than throwing when an account is not there', async () => {
    const { provider } = await ready();
    const missing = await provider.getAccount('acct_nobody');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('NOT_FOUND');
  });

  it('keeps one customer per learner per Business (PAY-02, PAY-12)', async () => {
    const { provider, accountId } = await ready();

    const first = await provider.ensureCustomer({ accountId, reference: 'learner-1', email: 'one@example.test' });
    const again = await provider.ensureCustomer({ accountId, reference: 'learner-1', email: 'one@example.test' });
    const other = await provider.ensureCustomer({ accountId, reference: 'learner-2' });

    expect(first.ok && again.ok && other.ok).toBe(true);
    if (first.ok && again.ok && other.ok) {
      expect(again.data.customerId).toBe(first.data.customerId);
      expect(other.data.customerId).not.toBe(first.data.customerId);
    }
  });

  it('starts a payment the browser can finish', async () => {
    const { provider, accountId } = await ready();

    const intent = await provider.createCheckoutIntent({
      accountId,
      amountPence: 4200,
      metadata: { booking_id: 'booking-1' },
    });

    expect(intent.ok).toBe(true);
    if (!intent.ok) return;
    expect(intent.data.amountPence).toBe(4200);
    expect(intent.data.currency).toBe('gbp');
    expect(intent.data.clientSecret).toBeTruthy();
    expect(intent.data.metadata.booking_id).toBe('booking-1');

    const read = await provider.getPaymentIntent({ accountId, paymentIntentId: intent.data.id });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data.id).toBe(intent.data.id);
  });

  it('starts saving a card with nothing taken, for charging before a lesson (PAY-03)', async () => {
    const { provider, accountId } = await ready();
    const customer = await provider.ensureCustomer({ accountId, reference: 'learner-setup' });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;

    const setup = await provider.createCardSetup({ accountId, customerId: customer.data.customerId });
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    expect(setup.data.status).toBe('requires_payment_method');
    expect(setup.data.clientSecret).toBeTruthy();
    expect(setup.data.customerId).toBe(customer.data.customerId);
  });

  it('takes nothing for nothing', async () => {
    const { provider, accountId } = await ready();
    const nothing = await provider.createCheckoutIntent({ accountId, amountPence: 0 });
    expect(nothing.ok).toBe(false);
  });

  it('starts the same payment once, however many times it is asked (R-11)', async () => {
    const { provider, accountId } = await ready();
    const key = `contract-${String(Date.now())}`;

    const first = await provider.createCheckoutIntent({ accountId, amountPence: 4200, idempotencyKey: key });
    const again = await provider.createCheckoutIntent({ accountId, amountPence: 4200, idempotencyKey: key });

    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) expect(again.data.id).toBe(first.data.id);
  });

  it('charges a card that is already saved, and refuses one that is refused (PAY-03)', async () => {
    const { provider, accountId } = await ready();
    const customer = await provider.ensureCustomer({ accountId, reference: 'learner-charge' });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;

    const paid = await provider.chargeSavedMethod({
      accountId,
      customerId: customer.data.customerId,
      paymentMethodId: contract.workingCard,
      amountPence: 4200,
    });
    expect(paid.ok).toBe(true);
    if (paid.ok) expect(paid.data.status).toBe('succeeded');

    const refused = await provider.chargeSavedMethod({
      accountId,
      customerId: customer.data.customerId,
      paymentMethodId: contract.refusedCard,
      amountPence: 4200,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('DECLINED');
  });

  it('holds a card rather than charging it, then takes the hold or lets it go (R-12)', async () => {
    const { provider, accountId } = await ready();
    const customer = await provider.ensureCustomer({ accountId, reference: 'learner-hold' });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;

    const hold = () =>
      provider.chargeSavedMethod({
        accountId,
        customerId: customer.data.customerId,
        paymentMethodId: contract.workingCard,
        amountPence: 4200,
        holdOnly: true,
        onSession: true,
      });

    const held = await hold();
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.data.status, 'held, not taken').toBe('requires_capture');

    const taken = await provider.captureHold({ accountId, paymentIntentId: held.data.id });
    expect(taken.ok && taken.data.status).toBe('succeeded');

    const second = await hold();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const letGo = await provider.cancelHold({ accountId, paymentIntentId: second.data.id });
    expect(letGo.ok && letGo.data.status).toBe('canceled');
  });

  it('gives money back, once, and never more than was taken (PAY-07)', async () => {
    const { provider, accountId } = await ready();
    const customer = await provider.ensureCustomer({ accountId, reference: 'learner-refund' });
    expect(customer.ok).toBe(true);
    if (!customer.ok) return;

    const paid = await provider.chargeSavedMethod({
      accountId,
      customerId: customer.data.customerId,
      paymentMethodId: contract.workingCard,
      amountPence: 4200,
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const key = `refund-${String(Date.now())}`;
    const part = await provider.refund({
      accountId,
      paymentIntentId: paid.data.id,
      amountPence: 2100,
      idempotencyKey: key,
    });
    const same = await provider.refund({
      accountId,
      paymentIntentId: paid.data.id,
      amountPence: 2100,
      idempotencyKey: key,
    });
    expect(part.ok && same.ok).toBe(true);
    if (part.ok && same.ok) expect(same.data.id).toBe(part.data.id);

    const tooMuch = await provider.refund({ accountId, paymentIntentId: paid.data.id, amountPence: 4200 });
    expect(tooMuch.ok, 'more than was paid is refused').toBe(false);
  });

  it('refuses a payment nobody made', async () => {
    const { provider, accountId } = await ready();
    const nothing = await provider.refund({ accountId, paymentIntentId: 'pi_nobody' });
    expect(nothing.ok).toBe(false);
  });

  it('will not take an event whose signature is wrong (R-11)', async () => {
    const { provider } = await ready();
    const forged = await provider.verifyWebhook({
      body: JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' }),
      signature: 'not-a-signature',
      secret: 'whsec_test',
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.reason).toBe('BAD_SIGNATURE');
  });
}
