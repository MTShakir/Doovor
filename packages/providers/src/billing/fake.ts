import { subscriptionCarriesPro } from '@repo/core/subscription';
import type {
  BillingCustomer,
  BillingFailure,
  BillingProvider,
  BillingResult,
  BillingWebhookEvent,
  CheckoutSession,
  PaidInvoice,
  StartCheckoutInput,
  Subscription,
} from './types.ts';

/**
 * Pro that nobody pays for (ARCHITECTURE 10, D-231).
 *
 * What local runs, unit tests and the end to end suite use. It keeps the state a real provider
 * would and answers the same way, so a test can subscribe, renew, take a discount, spend a
 * referral month and cancel without a network or a key.
 *
 * Checkout does not pretend to be a page: `startCheckout` answers with a URL that finishes the
 * subscription when it is opened, which is what `finishCheckout` is for. A test drives that
 * directly rather than filling in a card that does not exist.
 */

const ok = <T>(data: T): BillingResult<T> => ({ ok: true, data });
const no = (reason: BillingFailure, message: string): BillingResult<never> => ({ ok: false, reason, message });

interface Customer {
  id: string;
  businessId: string;
  email: string;
  name: string;
  /** Pence owed to them, spent before the card is used, the way Stripe's balance works. */
  creditPence: number;
}

interface Pending {
  sessionId: string;
  input: StartCheckoutInput;
}

export interface FakeBillingProvider extends BillingProvider {
  /** Finishes a checkout as if somebody had paid, and answers the events that would follow. */
  finishCheckout: (sessionId: string) => { subscription: Subscription; invoice: PaidInvoice } | null;
  /** Renews a subscription, taking whatever credit is left first. */
  renew: (subscriptionId: string) => { subscription: Subscription; invoice: PaidInvoice } | null;
  /** Ends one the way a failed card eventually does. */
  end: (subscriptionId: string, status: 'canceled' | 'unpaid') => Subscription | null;
  creditOf: (customerId: string) => number;
  reset: () => void;
}

export function createFakeBillingProvider(): FakeBillingProvider {
  const customers = new Map<string, Customer>();
  const byBusiness = new Map<string, string>();
  const pending = new Map<string, Pending>();
  const subscriptions = new Map<string, Subscription>();
  let counter = 0;
  const next = (prefix: string) => `${prefix}_${String(++counter).padStart(4, '0')}`;

  /** Takes what the balance covers and answers what the card was actually asked for. */
  function charge(customer: Customer, pence: number): number {
    const used = Math.min(customer.creditPence, pence);
    customer.creditPence -= used;
    return pence - used;
  }

  return {
    ensureCustomer({ businessId, email, name }): Promise<BillingResult<BillingCustomer>> {
      const already = byBusiness.get(businessId);
      if (already !== undefined) {
        const customer = customers.get(already);
        if (customer) {
          customer.email = email;
          customer.name = name;
        }
        return Promise.resolve(ok({ customerId: already }));
      }
      const id = next('cus');
      customers.set(id, { id, businessId, email, name, creditPence: 0 });
      byBusiness.set(businessId, id);
      return Promise.resolve(ok({ customerId: id }));
    },

    startCheckout(input): Promise<BillingResult<CheckoutSession>> {
      if (!customers.has(input.customerId)) return Promise.resolve(no('not_found', 'No such customer.'));
      if (!Number.isInteger(input.unitAmountPence) || input.unitAmountPence <= 0) {
        return Promise.resolve(no('invalid', 'A subscription needs a price in whole pence.'));
      }
      const sessionId = next('cs');
      pending.set(sessionId, { sessionId, input });
      return Promise.resolve(ok({ sessionId, url: `${input.successUrl}?session=${sessionId}` }));
    },

    getSubscription(subscriptionId): Promise<BillingResult<Subscription>> {
      const found = subscriptions.get(subscriptionId);
      return Promise.resolve(found ? ok(found) : no('not_found', 'No such subscription.'));
    },

    setSubscriptionPrice({ subscriptionId, unitAmountPence }): Promise<BillingResult<Subscription>> {
      const found = subscriptions.get(subscriptionId);
      if (!found) return Promise.resolve(no('not_found', 'No such subscription.'));
      if (!Number.isInteger(unitAmountPence) || unitAmountPence <= 0) {
        return Promise.resolve(no('invalid', 'A subscription needs a price in whole pence.'));
      }
      const changed = { ...found, unitAmountPence };
      subscriptions.set(subscriptionId, changed);
      return Promise.resolve(ok(changed));
    },

    setCancelAtPeriodEnd({ subscriptionId, cancel }): Promise<BillingResult<Subscription>> {
      const found = subscriptions.get(subscriptionId);
      if (!found) return Promise.resolve(no('not_found', 'No such subscription.'));
      const changed = { ...found, cancelAtPeriodEnd: cancel };
      subscriptions.set(subscriptionId, changed);
      return Promise.resolve(ok(changed));
    },

    addCredit({ customerId, pence }): Promise<BillingResult<null>> {
      const customer = customers.get(customerId);
      if (!customer) return Promise.resolve(no('not_found', 'No such customer.'));
      customer.creditPence += Math.max(0, Math.trunc(pence));
      return Promise.resolve(ok(null));
    },

    verifyWebhook({ body, signature }): Promise<BillingResult<BillingWebhookEvent>> {
      if (signature !== 'fake-signature') return Promise.resolve(no('invalid', 'The signature does not match.'));
      try {
        return Promise.resolve(ok(JSON.parse(body) as BillingWebhookEvent));
      } catch {
        return Promise.resolve(no('invalid', 'That is not an event.'));
      }
    },

    finishCheckout(sessionId) {
      const waiting = pending.get(sessionId);
      if (!waiting) return null;
      pending.delete(sessionId);
      const { input } = waiting;
      const customer = customers.get(input.customerId);
      if (!customer) return null;

      customer.creditPence += Math.max(0, Math.trunc(input.creditPence));
      const paid = charge(customer, input.unitAmountPence);
      const id = next('sub');
      const subscription: Subscription = {
        id,
        customerId: input.customerId,
        status: 'active',
        interval: input.interval,
        unitAmountPence: input.unitAmountPence,
        currentPeriodEnd: periodEnd(new Date(), input.interval),
        cancelAtPeriodEnd: false,
        metadata: { business_id: input.businessId },
      };
      subscriptions.set(id, subscription);
      return { subscription, invoice: { id: next('in'), subscriptionId: id, paidPence: paid, paidAt: new Date() } };
    },

    renew(subscriptionId) {
      const found = subscriptions.get(subscriptionId);
      if (!found || !subscriptionCarriesPro(found.status)) return null;
      if (found.cancelAtPeriodEnd) {
        const ended = { ...found, status: 'canceled' as const, currentPeriodEnd: found.currentPeriodEnd };
        subscriptions.set(subscriptionId, ended);
        return null;
      }
      const customer = customers.get(found.customerId);
      if (!customer) return null;
      const paid = charge(customer, found.unitAmountPence);
      const renewed: Subscription = {
        ...found,
        status: 'active',
        currentPeriodEnd: periodEnd(found.currentPeriodEnd ?? new Date(), found.interval),
      };
      subscriptions.set(subscriptionId, renewed);
      return {
        subscription: renewed,
        invoice: { id: next('in'), subscriptionId, paidPence: paid, paidAt: new Date() },
      };
    },

    end(subscriptionId, status) {
      const found = subscriptions.get(subscriptionId);
      if (!found) return null;
      const ended = { ...found, status, currentPeriodEnd: found.currentPeriodEnd };
      subscriptions.set(subscriptionId, ended);
      return ended;
    },

    creditOf(customerId) {
      return customers.get(customerId)?.creditPence ?? 0;
    },

    reset() {
      customers.clear();
      byBusiness.clear();
      pending.clear();
      subscriptions.clear();
      counter = 0;
    },
  };
}

/** A month or a year on from a moment, which is what a period is. */
function periodEnd(from: Date, interval: 'month' | 'year'): Date {
  const end = new Date(from);
  if (interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export const fakeBillingProvider = createFakeBillingProvider();
