import { subscriptionCarriesPro } from '@repo/core/subscription';
import type {
  BillingCustomer,
  RefundedSubscription,
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

export interface FakeBillingOptions {
  /**
   * Where the fake sends the browser to subscribe. The default finishes nothing: a test calls
   * `finishCheckout` itself. The app points it at a page of its own, so the whole flow can be
   * clicked through without a key, the way the payments fake does for onboarding.
   */
  checkoutUrl?: (input: { sessionId: string; successUrl: string }) => string;
}

export function createFakeBillingProvider(options: FakeBillingOptions = {}): FakeBillingProvider {
  const customers = new Map<string, Customer>();
  const byBusiness = new Map<string, string>();
  const pending = new Map<string, Pending>();
  const subscriptions = new Map<string, Subscription>();
  /** The last invoice of each subscription, so a duplicate can be given back what it took. */
  const lastInvoice = new Map<string, { paidPence: number; creditAppliedPence: number }>();
  let counter = 0;
  const next = (prefix: string) => `${prefix}_${String(++counter).padStart(4, '0')}`;

  /** Takes what the balance covers, and answers both halves: what the card paid and what credit did. */
  function charge(customer: Customer, pence: number): { paid: number; credited: number } {
    const used = Math.min(customer.creditPence, pence);
    customer.creditPence -= used;
    return { paid: pence - used, credited: used };
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
      const url =
        options.checkoutUrl?.({ sessionId, successUrl: input.successUrl }) ??
        `${input.successUrl}?session=${sessionId}`;
      return Promise.resolve(ok({ sessionId, url }));
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

    cancelAndRefund({ subscriptionId, customerId }): Promise<BillingResult<RefundedSubscription>> {
      const found = subscriptions.get(subscriptionId);
      if (!found) return Promise.resolve(no('not_found', 'No such subscription.'));
      const customer = customers.get(customerId);
      if (!customer) return Promise.resolve(no('not_found', 'No such customer.'));

      subscriptions.set(subscriptionId, { ...found, status: 'canceled', cancelAtPeriodEnd: false });
      const took = lastInvoice.get(subscriptionId) ?? { paidPence: 0, creditAppliedPence: 0 };
      // Refunding the same duplicate twice would give the money back twice.
      lastInvoice.delete(subscriptionId);
      customer.creditPence += took.creditAppliedPence;
      return Promise.resolve(ok({ refundedPence: took.paidPence, creditRestoredPence: took.creditAppliedPence }));
    },

    verifyWebhook({ body, signature }): Promise<BillingResult<BillingWebhookEvent>> {
      if (signature !== 'fake-signature') return Promise.resolve(no('invalid', 'The signature does not match.'));
      try {
        // JSON has no dates, so a body that went over a wire has them as text. The real provider
        // answers with Date objects, so this one has to as well or the app would only work here.
        return Promise.resolve(ok(withDates(JSON.parse(body) as BillingWebhookEvent)));
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
      const taken = charge(customer, input.unitAmountPence);
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
      lastInvoice.set(id, { paidPence: taken.paid, creditAppliedPence: taken.credited });
      return {
        subscription,
        invoice: {
          id: next('in'),
          subscriptionId: id,
          paidPence: taken.paid,
          creditAppliedPence: taken.credited,
          paidAt: new Date(),
        },
      };
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
      const taken = charge(customer, found.unitAmountPence);
      const renewed: Subscription = {
        ...found,
        status: 'active',
        currentPeriodEnd: periodEnd(found.currentPeriodEnd ?? new Date(), found.interval),
      };
      subscriptions.set(subscriptionId, renewed);
      lastInvoice.set(subscriptionId, { paidPence: taken.paid, creditAppliedPence: taken.credited });
      return {
        subscription: renewed,
        invoice: {
          id: next('in'),
          subscriptionId,
          paidPence: taken.paid,
          creditAppliedPence: taken.credited,
          paidAt: new Date(),
        },
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
      lastInvoice.clear();
      counter = 0;
    },
  };
}

/** A date that may have come back as text, as a date. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The two dates an event carries, whichever way round it arrived. */
function withDates(event: BillingWebhookEvent): BillingWebhookEvent {
  if (event.subscription) {
    event.subscription.currentPeriodEnd = asDate(event.subscription.currentPeriodEnd);
  }
  if (event.invoice) {
    event.invoice.paidAt = asDate(event.invoice.paidAt) ?? new Date();
  }
  return event;
}

/** A month or a year on from a moment, which is what a period is. */
function periodEnd(from: Date, interval: 'month' | 'year'): Date {
  const end = new Date(from);
  if (interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export const fakeBillingProvider = createFakeBillingProvider();
