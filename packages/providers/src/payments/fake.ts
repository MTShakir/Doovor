import type {
  AccountLink,
  AccountLinkInput,
  AccountState,
  ChargeSavedMethodInput,
  CheckoutIntentInput,
  ConnectedAccount,
  PaymentIntent,
  PaymentResult,
  PaymentsProvider,
  Refund,
  RefundInput,
  SavedCard,
  WebhookEvent,
} from './types.ts';

/**
 * Money that does not move (ARCHITECTURE 10, M3-01).
 *
 * What local runs, unit tests and the end to end suite use. It keeps the same state a real
 * provider would and answers the same way, so a test can take a payment, hold one, capture it
 * and refund it without a network or a key.
 *
 * Cards behave by number, the way Stripe's test cards do: one is refused, one asks for
 * authentication, the rest work.
 */

/** Test cards, so a test can ask for a refusal without pretending. */
export const fakeCards = {
  works: 'pm_card_visa',
  declined: 'pm_card_declined',
  authenticationRequired: 'pm_card_authentication_required',
} as const;

interface FakeState {
  accounts: Map<string, AccountState>;
  /** The sites each account has claimed for wallets (PAY-02). */
  domains: Map<string, string[]>;
  customers: Map<string, { accountId: string; reference: string }>;
  cards: Map<string, SavedCard[]>;
  intents: Map<string, PaymentIntent>;
  refunds: Map<string, Refund[]>;
  /** What each idempotency key answered, so the same key never does the work twice. */
  answered: Map<string, string>;
}

export interface FakePaymentsOptions {
  /** Whether a new connected account can take payments at once. Real ones cannot (PAY-01). */
  chargesEnabledAtOnce?: boolean;
  /** Where the fake's ids start, so a test can read them. */
  prefix?: string;
  /**
   * Where onboarding happens. Local runs point this at a page in the app itself, so the whole
   * connect flow can be walked through without Stripe.
   */
  onboardingUrl?: (input: AccountLinkInput) => string;
}

export interface FakePaymentsProvider extends PaymentsProvider {
  /** What the fake has been through, for a test to look at. */
  readonly state: FakeState;
  /** Stands in for somebody finishing Stripe's onboarding (PAY-01). */
  completeOnboarding: (accountId: string) => boolean;
  /**
   * Stands in for a card going through, or being refused (PAY-02). Returns the payment as it
   * now stands, which is what the provider would send in an event.
   */
  completePayment: (paymentIntentId: string, outcome?: 'succeeded' | 'failed') => PaymentIntent | null;
  /** Pretends the provider sent an event, for the webhook path (R-11). */
  event: (type: string, data: Record<string, unknown>, accountId?: string) => WebhookEvent;
  /** Signs a body the way the real one does, so the webhook route can be tested. */
  sign: (body: string, secret: string) => string;
  reset: () => void;
}

const ok = <T>(data: T): PaymentResult<T> => ({ ok: true, data });

export function fakePaymentsProvider(options: FakePaymentsOptions = {}): FakePaymentsProvider {
  const prefix = options.prefix ?? 'fake';
  let counter = 0;
  const next = (kind: string): string => {
    counter += 1;
    return `${prefix}_${kind}_${String(counter)}`;
  };

  const state: FakeState = {
    accounts: new Map(),
    domains: new Map(),
    customers: new Map(),
    cards: new Map(),
    intents: new Map(),
    refunds: new Map(),
    answered: new Map(),
  };

  /** The same key twice is the same answer, without doing it again (R-11). */
  const once = <T>(key: string | undefined, id: () => string, make: (id: string) => T): T => {
    if (key === undefined) return make(id());
    const known = state.answered.get(key);
    if (known !== undefined) return make(known);
    const fresh = id();
    state.answered.set(key, fresh);
    return make(fresh);
  };

  const intentOf = (id: string): PaymentIntent | undefined => state.intents.get(id);

  const put = (intent: PaymentIntent): PaymentIntent => {
    state.intents.set(intent.id, intent);
    return intent;
  };

  return {
    state,

    completeOnboarding: (accountId) => {
      const account = state.accounts.get(accountId);
      if (!account) return false;
      state.accounts.set(accountId, {
        ...account,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirements: [],
      });
      return true;
    },

    completePayment: (paymentIntentId, outcome = 'succeeded') => {
      const intent = state.intents.get(paymentIntentId);
      if (!intent) return null;
      if (outcome === 'failed') return put({ ...intent, status: 'requires_payment_method' });
      return put({ ...intent, status: 'succeeded', clientSecret: null, chargeId: intent.chargeId ?? next('ch') });
    },

    reset: () => {
      state.accounts.clear();
      state.domains.clear();
      state.customers.clear();
      state.cards.clear();
      state.intents.clear();
      state.refunds.clear();
      state.answered.clear();
      counter = 0;
    },

    createAccount: (input): Promise<PaymentResult<ConnectedAccount>> => {
      const accountId = next('acct');
      state.accounts.set(accountId, {
        accountId,
        chargesEnabled: options.chargesEnabledAtOnce ?? false,
        payoutsEnabled: options.chargesEnabledAtOnce ?? false,
        detailsSubmitted: options.chargesEnabledAtOnce ?? false,
        requirements: options.chargesEnabledAtOnce ? [] : ['external_account', 'individual.verification.document'],
      });
      state.customers.set(`${accountId}:business`, { accountId, reference: input.businessName });
      return Promise.resolve(ok({ accountId }));
    },

    createAccountLink: (input: AccountLinkInput): Promise<PaymentResult<AccountLink>> => {
      if (!state.accounts.has(input.accountId)) {
        return Promise.resolve({ ok: false, reason: 'NOT_FOUND', message: 'No such account.' });
      }
      const url =
        options.onboardingUrl?.(input) ??
        `https://connect.example.test/${input.accountId}?return=${encodeURIComponent(input.returnUrl)}`;
      return Promise.resolve(ok({ url, expiresAt: new Date(Date.now() + 5 * 60_000) }));
    },

    getAccount: (accountId): Promise<PaymentResult<AccountState>> => {
      const account = state.accounts.get(accountId);
      return Promise.resolve(
        account ? ok(account) : { ok: false, reason: 'NOT_FOUND', message: 'No such account.' },
      );
    },

    registerPaymentDomain: (input): Promise<PaymentResult<null>> => {
      const known = state.domains.get(input.accountId) ?? [];
      if (!known.includes(input.domain)) state.domains.set(input.accountId, [...known, input.domain]);
      return Promise.resolve(ok(null));
    },

    ensureCustomer: (input): Promise<PaymentResult<{ customerId: string }>> => {
      const key = `${input.accountId}:${input.reference}`;
      const known = [...state.customers.entries()].find(
        ([id, customer]) =>
          id.startsWith(`${prefix}_cus_`) &&
          customer.accountId === input.accountId &&
          customer.reference === input.reference,
      );
      if (known) return Promise.resolve(ok({ customerId: known[0] }));

      const customerId = next('cus');
      state.customers.set(customerId, { accountId: input.accountId, reference: input.reference });
      state.customers.set(key, { accountId: input.accountId, reference: input.reference });
      return Promise.resolve(ok({ customerId }));
    },

    listSavedCards: (input): Promise<PaymentResult<SavedCard[]>> =>
      Promise.resolve(ok(state.cards.get(`${input.accountId}:${input.customerId}`) ?? [])),

    forgetSavedCard: (input): Promise<PaymentResult<null>> => {
      for (const [key, cards] of state.cards) {
        if (!key.startsWith(`${input.accountId}:`)) continue;
        state.cards.set(
          key,
          cards.filter((card) => card.paymentMethodId !== input.paymentMethodId),
        );
      }
      return Promise.resolve(ok(null));
    },

    createCheckoutIntent: (input: CheckoutIntentInput): Promise<PaymentResult<PaymentIntent>> => {
      if (input.amountPence <= 0) {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'Nothing to pay.' });
      }
      const intent = once(
        input.idempotencyKey,
        () => next('pi'),
        (id) =>
          intentOf(id) ??
          put({
            id,
            status: 'requires_payment_method',
            amountPence: input.amountPence,
            currency: input.currency ?? 'gbp',
            clientSecret: `${id}_secret`,
            accountId: input.accountId,
            metadata: input.metadata ?? {},
            chargeId: null,
          }),
      );
      return Promise.resolve(ok(intent));
    },

    getPaymentIntent: (input): Promise<PaymentResult<PaymentIntent>> => {
      const intent = intentOf(input.paymentIntentId);
      return Promise.resolve(intent ? ok(intent) : { ok: false, reason: 'NOT_FOUND', message: 'No such payment.' });
    },

    captureHold: (input): Promise<PaymentResult<PaymentIntent>> => {
      const intent = intentOf(input.paymentIntentId);
      if (!intent) return Promise.resolve({ ok: false, reason: 'NOT_FOUND', message: 'No such payment.' });
      if (intent.status !== 'requires_capture') {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'That payment is not being held.' });
      }
      return Promise.resolve(
        ok(
          put({
            ...intent,
            status: 'succeeded',
            amountPence: input.amountPence ?? intent.amountPence,
            chargeId: intent.chargeId ?? next('ch'),
          }),
        ),
      );
    },

    cancelHold: (input): Promise<PaymentResult<PaymentIntent>> => {
      const intent = intentOf(input.paymentIntentId);
      if (!intent) return Promise.resolve({ ok: false, reason: 'NOT_FOUND', message: 'No such payment.' });
      if (intent.status === 'succeeded') {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'That payment has already been taken.' });
      }
      return Promise.resolve(ok(put({ ...intent, status: 'canceled', clientSecret: null })));
    },

    chargeSavedMethod: (input: ChargeSavedMethodInput): Promise<PaymentResult<PaymentIntent>> => {
      if (input.paymentMethodId === fakeCards.declined) {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'The card was declined.' });
      }
      if (input.paymentMethodId === fakeCards.authenticationRequired) {
        return Promise.resolve({
          ok: false,
          reason: 'AUTHENTICATION_REQUIRED',
          message: 'The bank wants the cardholder to confirm it is them.',
        });
      }
      const intent = once(
        input.idempotencyKey,
        () => next('pi'),
        (id) =>
          intentOf(id) ??
          put({
            id,
            status: 'succeeded',
            amountPence: input.amountPence,
            currency: input.currency ?? 'gbp',
            clientSecret: null,
            accountId: input.accountId,
            metadata: input.metadata ?? {},
            chargeId: next('ch'),
          }),
      );
      return Promise.resolve(ok(intent));
    },

    refund: (input: RefundInput): Promise<PaymentResult<Refund>> => {
      const intent = intentOf(input.paymentIntentId);
      if (!intent) return Promise.resolve({ ok: false, reason: 'NOT_FOUND', message: 'No such payment.' });
      if (intent.status !== 'succeeded') {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'That payment was never taken.' });
      }

      const already = (state.refunds.get(intent.id) ?? []).reduce((sum, one) => sum + one.amountPence, 0);
      const asked = input.amountPence ?? intent.amountPence - already;
      if (asked <= 0 || already + asked > intent.amountPence) {
        return Promise.resolve({ ok: false, reason: 'DECLINED', message: 'That is more than was paid.' });
      }

      const refund = once(
        input.idempotencyKey,
        () => next('re'),
        (id): Refund => ({ id, paymentIntentId: intent.id, amountPence: asked, status: 'succeeded' }),
      );
      const seen = state.refunds.get(intent.id) ?? [];
      if (!seen.some((one) => one.id === refund.id)) state.refunds.set(intent.id, [...seen, refund]);
      return Promise.resolve(ok(refund));
    },

    verifyWebhook: (input): Promise<PaymentResult<WebhookEvent>> => {
      const expected = signature(input.body, input.secret);
      if (input.signature !== expected) {
        return Promise.resolve({ ok: false, reason: 'BAD_SIGNATURE', message: 'That signature is not ours.' });
      }
      try {
        const parsed = JSON.parse(input.body) as {
          id?: string;
          type?: string;
          account?: string;
          created?: number;
          data?: { object?: Record<string, unknown> };
        };
        return Promise.resolve(
          ok({
            id: parsed.id ?? '',
            type: parsed.type ?? '',
            accountId: parsed.account ?? null,
            data: parsed.data?.object ?? {},
            createdAt: new Date((parsed.created ?? 0) * 1000),
          }),
        );
      } catch {
        return Promise.resolve({ ok: false, reason: 'BAD_SIGNATURE', message: 'That is not an event.' });
      }
    },

    event: (type, data, accountId) => {
      const id = next('evt');
      return {
        id,
        type,
        accountId: accountId ?? null,
        data,
        createdAt: new Date(),
      };
    },

    sign: (body, secret) => signature(body, secret),
  };
}

/**
 * A stand-in for the real signature. Not cryptography: it only has to be hard to produce by
 * accident, so a test proves the route checks something rather than nothing.
 */
function signature(body: string, secret: string): string {
  let hash = 5381;
  for (const character of `${secret}.${body}`) {
    hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) % 0xffffffff;
  }
  return `fake_sig_${hash.toString(16)}`;
}
