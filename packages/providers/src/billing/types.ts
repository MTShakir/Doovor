/**
 * Taking money for Pro (9.18, D-231). Separate from `payments` on purpose.
 *
 * `payments` is Stripe Connect: a learner paying an instructor, into that instructor's own
 * account, with us never holding it. This is the other direction and the other account: an
 * instructor paying us for Pro, on our own platform account. Different money, different keys,
 * different failure modes, so a different interface rather than more methods on that one.
 *
 * **No price crosses this boundary from a browser.** Every amount here is worked out by
 * `packages/core/src/subscription.ts` from the plan and from what the Business has already paid.
 * The caller passes pence; the browser passes a plan and an interval and never sees either
 * number until Stripe shows it.
 *
 * Money is integer pence, as everywhere else.
 */

import type { BillingInterval, SubscriptionStatus } from '@repo/core/subscription';

export type { BillingInterval, SubscriptionStatus };

/** The customer a Business is, on our own account. One per Business, for ever. */
export interface BillingCustomer {
  customerId: string;
}

/** Where somebody is sent to put a card in. Stripe's own page: no card field is ever ours. */
export interface CheckoutSession {
  /** Where to send the browser. */
  url: string;
  /** So a webhook can tell which attempt it is answering. */
  sessionId: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  /** What it renews for, in pence, as the provider has it. */
  unitAmountPence: number;
  /** When the paid-for period runs out, which is when it renews or ends. */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** What it was for, so a webhook needs no lookup table. */
  metadata: Record<string, string>;
}

/** An invoice that was actually paid, which is the only thing that earns anything. */
export interface PaidInvoice {
  id: string;
  subscriptionId: string;
  /** What was taken after every discount and credit: nought when credit covered it all. */
  paidPence: number;
  /**
   * What came off the customer's balance to pay for this one, in pence. This is how many referral
   * months to mark spent, and it is read from the invoice rather than worked out from the price:
   * what Stripe actually used is the only number that cannot drift (D-205).
   */
  creditAppliedPence: number;
  paidAt: Date;
}

export type BillingFailure =
  /** The card was refused, or the customer has no way to pay. */
  | 'refused'
  /** Nothing of that name on the account. */
  | 'not_found'
  /** The provider could not be reached, or answered with something unusable. */
  | 'unavailable'
  /** We asked for something the provider will not do, which is a bug here rather than there. */
  | 'invalid';

export type BillingResult<T> = { ok: true; data: T } | { ok: false; reason: BillingFailure; message: string };

export interface StartCheckoutInput {
  customerId: string;
  interval: BillingInterval;
  /**
   * What a period costs, worked out by `subscriptionPricePence`. Never a number from a browser,
   * and never read back from the provider to decide what to charge.
   */
  unitAmountPence: number;
  /**
   * Months earned by referring people, put on the customer's balance so they come off the first
   * invoice (D-205). Pence, worked out by `bankedMonthsCreditPence`.
   */
  creditPence: number;
  /** Where Stripe sends the browser back to. Neither grants anything: the webhook does that. */
  successUrl: string;
  cancelUrl: string;
  /** The Business this is for, which every event then carries back to us. */
  businessId: string;
}

/** An event from the provider, once its signature has been checked. */
export interface BillingWebhookEvent {
  id: string;
  type: string;
  subscription: Subscription | null;
  invoice: PaidInvoice | null;
}

/**
 * What the app asks a billing service to do. Nothing throws: a refused card is an ordinary
 * thing that happens to people, and the answer says so.
 */
export interface BillingProvider {
  /** The customer for a Business, made once and found thereafter (D-231). */
  ensureCustomer: (input: {
    businessId: string;
    email: string;
    name: string;
  }) => Promise<BillingResult<BillingCustomer>>;

  /** Sends somebody to Stripe's own page to subscribe. */
  startCheckout: (input: StartCheckoutInput) => Promise<BillingResult<CheckoutSession>>;

  getSubscription: (subscriptionId: string) => Promise<BillingResult<Subscription>>;

  /**
   * What the next period costs, when the loyalty discount has moved a step (D-206). Changing the
   * price of what somebody is already paying for is the one thing this does to a live
   * subscription, and it only ever takes money off.
   */
  setSubscriptionPrice: (input: {
    subscriptionId: string;
    unitAmountPence: number;
  }) => Promise<BillingResult<Subscription>>;

  /** Stop at the end of what has been paid for, or change your mind and carry on. */
  setCancelAtPeriodEnd: (input: {
    subscriptionId: string;
    cancel: boolean;
  }) => Promise<BillingResult<Subscription>>;

  /** Credit on the customer's balance, which comes off the next invoice before the card is used. */
  addCredit: (input: { customerId: string; pence: number; reason: string }) => Promise<BillingResult<null>>;

  /**
   * Undoes a subscription that should never have existed (D-239).
   *
   * Two browser tabs can both finish a checkout in the seconds before the first event lands, and
   * the second one is a second subscription for a Business that can only have one. This ends it
   * at once rather than at the end of the period, gives the money back, and puts back whatever
   * came off the customer's balance to pay for it.
   *
   * Everything it does is to the duplicate. The one that was kept is not touched.
   */
  cancelAndRefund: (input: {
    subscriptionId: string;
    customerId: string;
  }) => Promise<BillingResult<RefundedSubscription>>;

  verifyWebhook: (input: {
    body: string;
    signature: string;
    secret: string;
  }) => Promise<BillingResult<BillingWebhookEvent>>;
}

/** What undoing a duplicate actually gave back. */
export interface RefundedSubscription {
  /** Money returned to the card, in pence. Nought when credit had covered the whole of it. */
  refundedPence: number;
  /** Balance put back on the customer, in pence, where the duplicate had spent some. */
  creditRestoredPence: number;
}
