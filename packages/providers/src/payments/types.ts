/**
 * Taking money (PRD 13, PAY-01 to PAY-09, ARCHITECTURE 8, M3-01).
 *
 * Everything that moves money goes through this interface, so the domain never learns what
 * Stripe calls things and a test never needs a network. Stripe Connect Express is the
 * implementation; `fakePaymentsProvider` is what tests and local runs use.
 *
 * Money is integer pence throughout, as it is everywhere else.
 */

/** Where a payment lands: the Business's own connected account (D-011, direct charges). */
export interface ConnectedAccount {
  /** The account id the provider gave us, stored on the Business. */
  accountId: string;
}

export type PaymentIntentStatus =
  /** Waiting for the learner to pay. */
  | 'requires_payment_method'
  /** The learner's bank wants them to confirm it is them. */
  | 'requires_action'
  /** Authorised, not yet taken: a request to book holds the money this way (R-12). */
  | 'requires_capture'
  | 'processing'
  | 'succeeded'
  | 'canceled';

export interface PaymentIntent {
  id: string;
  status: PaymentIntentStatus;
  amountPence: number;
  currency: string;
  /** What the browser needs to show the Payment Element. Never logged, never stored. */
  clientSecret: string | null;
  /** The connected account the money is going to. */
  accountId: string;
  /** What it was for, so a webhook can find the booking again without a lookup table. */
  metadata: Record<string, string>;
  /** Set once Stripe has a charge for it, which is what a refund refers to. */
  chargeId: string | null;
}

export interface CheckoutIntentInput {
  accountId: string;
  amountPence: number;
  currency?: string;
  /** Who is paying, on that connected account (PAY-02). */
  customerId?: string;
  /**
   * Hold the money rather than take it, for a lesson that has to be accepted first (R-12).
   * The hold is captured on accept and released on decline or expiry.
   */
  holdOnly?: boolean;
  /** Whether the learner may save the card for next time (PAY-02). */
  savePaymentMethod?: boolean;
  /** Identifiers only: booking id, business id. Never a name or an address. */
  metadata?: Record<string, string>;
  /** The same key for the same attempt, so a retry never charges twice (R-11). */
  idempotencyKey?: string;
  /** What the learner sees on their statement, at most 22 characters. */
  statementDescriptor?: string;
}

export interface ChargeSavedMethodInput {
  accountId: string;
  customerId: string;
  paymentMethodId: string;
  amountPence: number;
  currency?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  /**
   * Hold the money rather than take it, for a lesson that has to be accepted first (R-12). The
   * hold is captured on accept and released on decline or expiry.
   */
  holdOnly?: boolean;
  /**
   * The learner is here, pressing the button (PAY-02). Off by default, which is the charge
   * made 24 hours before a lesson with nobody at the keyboard (PAY-03). The bank is told which
   * it is, because it is allowed to treat the two differently and a charge that claims nobody
   * was there when somebody was is not one to make.
   */
  onSession?: boolean;
}

export interface RefundInput {
  accountId: string;
  /** The payment being given back, whole or in part. */
  paymentIntentId: string;
  /** Missing means all of it. */
  amountPence?: number;
  reason?: 'duplicate' | 'requested_by_customer' | 'fraudulent';
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface Refund {
  id: string;
  paymentIntentId: string;
  amountPence: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
}

export interface AccountLinkInput {
  accountId: string;
  /** Where Stripe sends them when they finish, and when the link has gone stale. */
  returnUrl: string;
  refreshUrl: string;
}

export interface AccountLink {
  url: string;
  expiresAt: Date;
}

export interface AccountState {
  accountId: string;
  /** True once Stripe will let this account take payments (PAY-01). */
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** What Stripe is still waiting for, so the app can say so rather than "not ready". */
  requirements: string[];
}

/** Where a card being saved without a payment has got to (PAY-03). */
export type CardSetupStatus = 'requires_payment_method' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';

/**
 * A card being saved for later with nothing taken now, for a Business that charges the day
 * before a lesson (PAY-03). The browser finishes it with the client secret, as it does a payment.
 */
export interface CardSetup {
  id: string;
  status: CardSetupStatus;
  /** What the Payment Element needs. Never logged, never stored. */
  clientSecret: string | null;
  accountId: string;
  customerId: string;
}

export interface SavedCard {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface WebhookEvent {
  id: string;
  type: string;
  /** Set when the event came from a connected account rather than the platform. */
  accountId: string | null;
  /** The object the event is about, as the provider sent it. */
  data: Record<string, unknown>;
  createdAt: Date;
}

export type PaymentFailure =
  /** The card was refused, or the request was wrong: sending it again will not help. */
  | 'DECLINED'
  /** The learner's bank wants them to confirm it is them. */
  | 'AUTHENTICATION_REQUIRED'
  /** The service could not be reached, or answered with something unusable. Try again. */
  | 'UNAVAILABLE'
  /** Nothing is configured to take money with. */
  | 'NOT_CONFIGURED'
  /** The signature on a webhook did not check out (R-11). */
  | 'BAD_SIGNATURE'
  | 'NOT_FOUND';

export type PaymentResult<T> = { ok: true; data: T } | { ok: false; reason: PaymentFailure; message: string };

/**
 * What the app asks a payments service to do. Nothing here throws: every answer says whether
 * it worked, because a refused card is an ordinary thing that happens to people.
 */
export interface PaymentsProvider {
  /** Connect Express onboarding (PAY-01). */
  createAccount: (input: { businessName: string; email?: string; country?: string }) => Promise<PaymentResult<ConnectedAccount>>;
  createAccountLink: (input: AccountLinkInput) => Promise<PaymentResult<AccountLink>>;
  getAccount: (accountId: string) => Promise<PaymentResult<AccountState>>;

  /**
   * Registers the site the Payment Element runs on, so wallets are offered (PAY-02). Apple Pay
   * refuses to appear on a domain the account has not claimed.
   */
  registerPaymentDomain: (input: { accountId: string; domain: string }) => Promise<PaymentResult<null>>;

  /** A person who pays a Business, kept on that Business's own account (PAY-02, PAY-12). */
  ensureCustomer: (input: {
    accountId: string;
    /** Ours, so the same learner is the same customer next time. */
    reference: string;
    email?: string;
    name?: string;
  }) => Promise<PaymentResult<{ customerId: string }>>;
  listSavedCards: (input: { accountId: string; customerId: string }) => Promise<PaymentResult<SavedCard[]>>;
  /**
   * Starts saving a card with nothing taken, to be charged later while nobody is at the keyboard
   * (PAY-03). The bank is told that is what it is for.
   */
  createCardSetup: (input: {
    accountId: string;
    customerId: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }) => Promise<PaymentResult<CardSetup>>;
  /**
   * Forgets a card. Given the customer, it forgets every copy of the same card they have, since
   * paying with one card twice can leave two of it behind and a card that comes back after it
   * was removed is a card somebody thinks we kept.
   */
  forgetSavedCard: (input: {
    accountId: string;
    paymentMethodId: string;
    customerId?: string;
  }) => Promise<PaymentResult<null>>;

  /** Paying for a lesson (PAY-02, PAY-03, R-10, R-12). */
  createCheckoutIntent: (input: CheckoutIntentInput) => Promise<PaymentResult<PaymentIntent>>;
  getPaymentIntent: (input: { accountId: string; paymentIntentId: string }) => Promise<PaymentResult<PaymentIntent>>;
  captureHold: (input: {
    accountId: string;
    paymentIntentId: string;
    /** Capturing less than was held, when the price changed. */
    amountPence?: number;
    idempotencyKey?: string;
  }) => Promise<PaymentResult<PaymentIntent>>;
  cancelHold: (input: { accountId: string; paymentIntentId: string }) => Promise<PaymentResult<PaymentIntent>>;
  chargeSavedMethod: (input: ChargeSavedMethodInput) => Promise<PaymentResult<PaymentIntent>>;

  /** Giving it back (PAY-07). */
  refund: (input: RefundInput) => Promise<PaymentResult<Refund>>;

  /** Proving an event really came from the provider, on the raw body (R-11). */
  verifyWebhook: (input: { body: string; signature: string; secret: string }) => Promise<PaymentResult<WebhookEvent>>;
}
