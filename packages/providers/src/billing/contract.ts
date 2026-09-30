import { plans } from '@repo/config/plans';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FakeBillingProvider } from './fake.ts';

/**
 * What any billing provider must do (D-231). The fake is run against this, and a real one is run
 * against it too the day there is a reason to: the point is that the app can be written once.
 *
 * Read these as the promises the rest of the product relies on. The strongest of them is that no
 * amount here was ever chosen by a browser.
 */
export function billingContract(name: string, make: () => FakeBillingProvider): void {
  describe(`${name} (9.18, D-231)`, () => {
    let billing: FakeBillingProvider;

    const business = 'b5f2a0c4-31d8-4a77-8a1f-2e9c0d5b7a13';
    const subscribe = async (over: Partial<Parameters<FakeBillingProvider['startCheckout']>[0]> = {}) => {
      const customer = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });
      if (!customer.ok) throw new Error(customer.message);
      const started = await billing.startCheckout({
        customerId: customer.data.customerId,
        interval: 'month',
        unitAmountPence: plans.pro.monthlyPricePence,
        creditPence: 0,
        successUrl: 'https://example.test/plan',
        cancelUrl: 'https://example.test/plan',
        businessId: business,
        ...over,
      });
      if (!started.ok) throw new Error(started.message);
      return { customerId: customer.data.customerId, sessionId: started.data.sessionId };
    };

    /** Finishes a checkout and insists it worked: a default here would hide a broken provider. */
    const finish = (sessionId: string) => {
      const done = billing.finishCheckout(sessionId);
      if (done === null) throw new Error('the checkout did not finish');
      return done;
    };

    const renewed = (subscriptionId: string) => {
      const done = billing.renew(subscriptionId);
      if (done === null) throw new Error('the subscription did not renew');
      return done;
    };

    beforeEach(() => {
      billing = make();
    });

    it('keeps one customer per Business, however often it is asked', async () => {
      const first = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });
      const again = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam Khan' });

      expect(first.ok && again.ok).toBe(true);
      if (first.ok && again.ok) expect(again.data.customerId).toBe(first.data.customerId);
    });

    it('refuses a subscription with no price, rather than charging nothing for ever', async () => {
      const customer = await billing.ensureCustomer({ businessId: business, email: 'sam@example.com', name: 'Sam' });
      if (!customer.ok) throw new Error(customer.message);

      for (const unitAmountPence of [0, -1200, 12.5]) {
        const started = await billing.startCheckout({
          customerId: customer.data.customerId,
          interval: 'month',
          unitAmountPence,
          creditPence: 0,
          successUrl: 'https://example.test/plan',
          cancelUrl: 'https://example.test/plan',
          businessId: business,
        });
        expect(started.ok).toBe(false);
      }
    });

    it('subscribes somebody, and the subscription carries the Business it is for', async () => {
      const { sessionId } = await subscribe();
      const done = finish(sessionId);

      expect(done.subscription.status).toBe('active');
      expect(done.subscription.metadata.business_id).toBe(business);
      expect(done.invoice.paidPence).toBe(plans.pro.monthlyPricePence);
      expect(done.subscription.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it('spends a referral month before it asks the card for anything (D-205)', async () => {
      // A month banked is worth a month, so the first invoice on a monthly plan takes nothing.
      const { customerId, sessionId } = await subscribe({ creditPence: plans.pro.monthlyPricePence });
      expect(finish(sessionId).invoice.paidPence).toBe(0);
      expect(billing.creditOf(customerId)).toBe(0);
    });

    it('spends what a year does not use up, and keeps the rest for next time', async () => {
      const { customerId, sessionId } = await subscribe({
        interval: 'year',
        unitAmountPence: plans.pro.yearlyPricePence ?? 0,
        creditPence: plans.pro.monthlyPricePence * 14,
      });
      const yearly = plans.pro.yearlyPricePence;
      if (yearly === null) throw new Error('Pro has no yearly price');

      // Fourteen months of credit against a year: the year is paid for and two months are left.
      expect(finish(sessionId).invoice.paidPence).toBe(0);
      expect(billing.creditOf(customerId)).toBe(plans.pro.monthlyPricePence * 14 - yearly);
    });

    it('renews, and takes the new price once the discount has moved (D-206)', async () => {
      const { sessionId } = await subscribe();
      const done = finish(sessionId);
      const cheaper = await billing.setSubscriptionPrice({ subscriptionId: done.subscription.id, unitAmountPence: 1140 });
      expect(cheaper.ok).toBe(true);

      const next = renewed(done.subscription.id);
      expect(next.invoice.paidPence).toBe(1140);
      expect(next.subscription.currentPeriodEnd).toBeInstanceOf(Date);
      expect(next.subscription.currentPeriodEnd?.getTime()).toBeGreaterThan(
        done.subscription.currentPeriodEnd?.getTime() ?? Number.NEGATIVE_INFINITY,
      );
    });

    it('will not price a subscription at nothing, even by mistake', async () => {
      const { sessionId } = await subscribe();
      const id = finish(sessionId).subscription.id;

      for (const unitAmountPence of [0, -1, 1.5]) {
        expect((await billing.setSubscriptionPrice({ subscriptionId: id, unitAmountPence })).ok).toBe(false);
      }
    });

    it('stops at the end of the period when asked, and does not renew after that', async () => {
      const { sessionId } = await subscribe();
      const id = finish(sessionId).subscription.id;

      const stopping = await billing.setCancelAtPeriodEnd({ subscriptionId: id, cancel: true });
      expect(stopping.ok && stopping.data.cancelAtPeriodEnd).toBe(true);
      expect(billing.renew(id)).toBeNull();

      const after = await billing.getSubscription(id);
      expect(after.ok && after.data.status).toBe('canceled');
    });

    it('says so rather than throwing when there is nothing of that name', async () => {
      for (const answer of [
        await billing.getSubscription('sub_nothing'),
        await billing.setSubscriptionPrice({ subscriptionId: 'sub_nothing', unitAmountPence: 1200 }),
        await billing.setCancelAtPeriodEnd({ subscriptionId: 'sub_nothing', cancel: true }),
        await billing.addCredit({ customerId: 'cus_nothing', pence: 100, reason: 'test' }),
      ]) {
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toBe('not_found');
      }
    });

    it('refuses to start a checkout for a customer it has never heard of', async () => {
      const started = await billing.startCheckout({
        customerId: 'cus_nothing',
        interval: 'month',
        unitAmountPence: plans.pro.monthlyPricePence,
        creditPence: 0,
        successUrl: 'https://example.test/plan',
        cancelUrl: 'https://example.test/plan',
        businessId: business,
      });

      expect(started.ok).toBe(false);
      if (!started.ok) expect(started.reason).toBe('not_found');
    });

    it('finishes a checkout once: opening the same one again is nothing', async () => {
      const { sessionId } = await subscribe();

      expect(billing.finishCheckout(sessionId)).not.toBeNull();
      expect(billing.finishCheckout(sessionId)).toBeNull();
      expect(billing.finishCheckout('cs_nothing')).toBeNull();
    });

    it('does not renew what has ended, whichever way it ended', async () => {
      for (const how of ['canceled', 'unpaid'] as const) {
        const { sessionId } = await subscribe();
        const id = finish(sessionId).subscription.id;
        expect(billing.end(id, how)).toMatchObject({ status: how });
        expect(billing.renew(id)).toBeNull();
      }
      expect(billing.renew('sub_nothing')).toBeNull();
      expect(billing.end('sub_nothing', 'canceled')).toBeNull();
    });

    it('puts credit on a customer, and spends it at the next renewal', async () => {
      const { customerId, sessionId } = await subscribe();
      const id = finish(sessionId).subscription.id;

      expect((await billing.addCredit({ customerId, pence: plans.pro.monthlyPricePence, reason: 'referral' })).ok).toBe(true);
      expect(billing.creditOf(customerId)).toBe(plans.pro.monthlyPricePence);
      // A negative credit is not a way to charge somebody more.
      expect((await billing.addCredit({ customerId, pence: -5000, reason: 'nonsense' })).ok).toBe(true);
      expect(billing.creditOf(customerId)).toBe(plans.pro.monthlyPricePence);

      expect(renewed(id).invoice.paidPence).toBe(0);
      expect(billing.creditOf(customerId)).toBe(0);
      expect(billing.creditOf('cus_nothing')).toBe(0);
    });

    it('will not take an event that is not an event at all', async () => {
      const answer = await billing.verifyWebhook({ body: 'not json', signature: 'fake-signature', secret: 'whsec' });

      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.reason).toBe('invalid');
    });

    it('starts again when it is reset, which is what a test between runs needs', async () => {
      const { customerId } = await subscribe();
      billing.reset();

      expect(billing.creditOf(customerId)).toBe(0);
      expect((await billing.getSubscription('sub_0001')).ok).toBe(false);
    });

    it('will not take an event whose signature is wrong (R-11)', async () => {
      const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', subscription: null, invoice: null });

      expect((await billing.verifyWebhook({ body, signature: 'forged', secret: 'whsec' })).ok).toBe(false);
      expect((await billing.verifyWebhook({ body, signature: 'fake-signature', secret: 'whsec' })).ok).toBe(true);
    });
  });
}
