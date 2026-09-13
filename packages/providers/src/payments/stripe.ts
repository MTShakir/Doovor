import Stripe from 'stripe';
import type {
  AccountLink,
  AccountLinkInput,
  AccountState,
  ChargeSavedMethodInput,
  CheckoutIntentInput,
  ConnectedAccount,
  PaymentFailure,
  PaymentIntent,
  PaymentIntentStatus,
  PaymentResult,
  PaymentsProvider,
  Refund,
  RefundInput,
  SavedCard,
  WebhookEvent,
} from './types.ts';

/**
 * Stripe Connect Express, with direct charges on the connected account (PAY-01, D-011).
 *
 * The Business is the merchant of record: the learner's statement shows the Business, the
 * card fees come out of the Business's balance, and refunds and disputes are theirs. Every
 * call carries the account it is for, which is what makes it a direct charge.
 *
 * Nothing here throws at the app. A refused card is an ordinary thing that happens to people,
 * so it comes back as an answer like any other.
 */

export interface StripeOptions {
  secretKey: string | undefined;
  /** Pinned, so an API change is something we choose rather than something that happens. */
  apiVersion?: Stripe.LatestApiVersion;
  /** Where a Business is registered. UK only in Phase 1. */
  country?: string;
  /** For tests: a client that is already made. */
  client?: Stripe;
}

/** The API version this code was written against. */
export const stripeApiVersion: Stripe.LatestApiVersion = '2026-08-26.dahlia';

function reasonFor(error: unknown): { reason: PaymentFailure; message: string } {
  if (error instanceof Stripe.errors.StripeError) {
    const code = error.code ?? '';
    if (code === 'authentication_required') {
      return { reason: 'AUTHENTICATION_REQUIRED', message: 'The bank wants the cardholder to confirm it is them.' };
    }
    if (error.type === 'StripeCardError') {
      return { reason: 'DECLINED', message: error.message };
    }
    if (error.type === 'StripeSignatureVerificationError') {
      return { reason: 'BAD_SIGNATURE', message: 'That signature is not ours.' };
    }
    if (error.type === 'StripeInvalidRequestError') {
      return { reason: error.statusCode === 404 ? 'NOT_FOUND' : 'DECLINED', message: error.message };
    }
    if (error.type === 'StripeAuthenticationError') {
      return { reason: 'NOT_CONFIGURED', message: 'Stripe refused our key.' };
    }
    return { reason: 'UNAVAILABLE', message: error.message };
  }
  return { reason: 'UNAVAILABLE', message: error instanceof Error ? error.message : 'The request failed.' };
}

const statuses: Record<string, PaymentIntentStatus> = {
  requires_payment_method: 'requires_payment_method',
  requires_confirmation: 'requires_payment_method',
  requires_action: 'requires_action',
  requires_capture: 'requires_capture',
  processing: 'processing',
  succeeded: 'succeeded',
  canceled: 'canceled',
};

function chargeIdOf(intent: Stripe.PaymentIntent): string | null {
  const latest: unknown = intent.latest_charge;
  if (typeof latest === 'string') return latest;
  if (latest && typeof latest === 'object' && 'id' in latest && typeof latest.id === 'string') return latest.id;
  return null;
}

/** A refund that is waiting on the bank is pending, whatever Stripe calls that this month. */
function refundStatus(status: string | null): Refund['status'] {
  if (status === 'succeeded' || status === 'failed' || status === 'canceled') return status;
  return 'pending';
}

function asIntent(intent: Stripe.PaymentIntent, accountId: string): PaymentIntent {
  return {
    id: intent.id,
    status: statuses[intent.status] ?? 'processing',
    amountPence: intent.amount,
    currency: intent.currency,
    clientSecret: intent.client_secret,
    accountId,
    metadata: intent.metadata,
    chargeId: chargeIdOf(intent),
  };
}

export function stripePaymentsProvider(options: StripeOptions): PaymentsProvider {
  const client =
    options.client ??
    (options.secretKey
      ? new Stripe(options.secretKey, { apiVersion: options.apiVersion ?? stripeApiVersion })
      : null);
  const country = options.country ?? 'GB';

  /** Every call goes the same way: try it, and turn whatever comes back into an answer. */
  async function call<T>(work: (stripe: Stripe) => Promise<T>): Promise<PaymentResult<T>> {
    if (!client) return { ok: false, reason: 'NOT_CONFIGURED', message: 'No Stripe key is set.' };
    try {
      return { ok: true, data: await work(client) };
    } catch (error) {
      return { ok: false, ...reasonFor(error) };
    }
  }

  return {
    createAccount: (input): Promise<PaymentResult<ConnectedAccount>> =>
      call(async (stripe) => {
        const account = await stripe.accounts.create({
          type: 'express',
          country: input.country ?? country,
          email: input.email,
          business_profile: { name: input.businessName },
          // The Business takes the card fees, because the Business takes the money (D-011).
          settings: { payouts: { schedule: { interval: 'daily' } } },
        });
        return { accountId: account.id };
      }),

    createAccountLink: (input: AccountLinkInput): Promise<PaymentResult<AccountLink>> =>
      call(async (stripe) => {
        const link = await stripe.accountLinks.create({
          account: input.accountId,
          refresh_url: input.refreshUrl,
          return_url: input.returnUrl,
          type: 'account_onboarding',
        });
        return { url: link.url, expiresAt: new Date(link.expires_at * 1000) };
      }),

    getAccount: (accountId): Promise<PaymentResult<AccountState>> =>
      call(async (stripe) => {
        const account = await stripe.accounts.retrieve(accountId);
        const due = account.requirements?.currently_due ?? [];
        const past = account.requirements?.past_due ?? [];
        return {
          accountId: account.id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements: [...new Set([...due, ...past])],
        };
      }),

    registerPaymentDomain: (input): Promise<PaymentResult<null>> =>
      call(async (stripe) => {
        await stripe.paymentMethodDomains.create(
          { domain_name: input.domain },
          { stripeAccount: input.accountId },
        );
        return null;
      }),

    ensureCustomer: (input): Promise<PaymentResult<{ customerId: string }>> =>
      call(async (stripe) => {
        // The app keeps its own mapping (billing_customers); this is the safety net for the
        // first time, and for anything that was made outside it.
        const found = await stripe.customers.search(
          { query: `metadata['reference']:'${input.reference}'`, limit: 1 },
          { stripeAccount: input.accountId },
        );
        const known = found.data[0];
        if (known) return { customerId: known.id };

        const made = await stripe.customers.create(
          {
            email: input.email,
            name: input.name,
            metadata: { reference: input.reference },
          },
          { stripeAccount: input.accountId, idempotencyKey: `customer:${input.accountId}:${input.reference}` },
        );
        return { customerId: made.id };
      }),

    listSavedCards: (input): Promise<PaymentResult<SavedCard[]>> =>
      call(async (stripe) => {
        const methods = await stripe.paymentMethods.list(
          { customer: input.customerId, type: 'card' },
          { stripeAccount: input.accountId },
        );
        // Paying with the same card twice through the form saves it twice. Stripe lists the
        // newest first, and the fingerprint is the card itself, so the first of each is kept.
        const seen = new Set<string>();
        return methods.data.flatMap((method): SavedCard[] => {
          if (!method.card) return [];
          const print = method.card.fingerprint ?? method.id;
          if (seen.has(print)) return [];
          seen.add(print);
          return [
            {
              paymentMethodId: method.id,
              brand: method.card.brand,
              last4: method.card.last4,
              expiryMonth: method.card.exp_month,
              expiryYear: method.card.exp_year,
            },
          ];
        });
      }),

    forgetSavedCard: async (input): Promise<PaymentResult<null>> => {
      const done = await call(async (stripe): Promise<'forgotten' | 'not_theirs'> => {
        const options = { stripeAccount: input.accountId };
        let doomed = [input.paymentMethodId];

        if (input.customerId !== undefined) {
          const methods = await stripe.paymentMethods.list({ customer: input.customerId, type: 'card' }, options);
          const chosen = methods.data.find((method) => method.id === input.paymentMethodId);
          // A card that is not on this customer is somebody else's card on the same account, and
          // it is not this customer's to remove.
          if (!chosen) return 'not_theirs';
          const print = chosen.card?.fingerprint;
          if (print) {
            doomed = methods.data.filter((method) => method.card?.fingerprint === print).map((method) => method.id);
          }
        }

        for (const id of doomed) await stripe.paymentMethods.detach(id, {}, options);
        return 'forgotten';
      });

      if (!done.ok) return done;
      if (done.data === 'not_theirs') return { ok: false, reason: 'NOT_FOUND', message: 'That card is not saved for them.' };
      return { ok: true, data: null };
    },

    createCheckoutIntent: (input: CheckoutIntentInput): Promise<PaymentResult<PaymentIntent>> =>
      call(async (stripe) => {
        const intent = await stripe.paymentIntents.create(
          {
            amount: input.amountPence,
            currency: input.currency ?? 'gbp',
            customer: input.customerId,
            // Card, Apple Pay and Google Pay, decided by the Payment Element (PAY-02).
            automatic_payment_methods: { enabled: true },
            // A lesson that has to be accepted first is held, not taken (R-12).
            capture_method: input.holdOnly ? 'manual' : 'automatic',
            ...(input.savePaymentMethod ? { setup_future_usage: 'off_session' as const } : {}),
            ...(input.statementDescriptor ? { statement_descriptor_suffix: input.statementDescriptor } : {}),
            metadata: input.metadata ?? {},
          },
          { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
        );
        return asIntent(intent, input.accountId);
      }),

    getPaymentIntent: (input): Promise<PaymentResult<PaymentIntent>> =>
      call(async (stripe) => {
        const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, undefined, {
          stripeAccount: input.accountId,
        });
        return asIntent(intent, input.accountId);
      }),

    captureHold: (input): Promise<PaymentResult<PaymentIntent>> =>
      call(async (stripe) => {
        const intent = await stripe.paymentIntents.capture(
          input.paymentIntentId,
          input.amountPence === undefined ? {} : { amount_to_capture: input.amountPence },
          { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
        );
        return asIntent(intent, input.accountId);
      }),

    cancelHold: (input): Promise<PaymentResult<PaymentIntent>> =>
      call(async (stripe) => {
        const intent = await stripe.paymentIntents.cancel(input.paymentIntentId, undefined, {
          stripeAccount: input.accountId,
        });
        return asIntent(intent, input.accountId);
      }),

    chargeSavedMethod: (input: ChargeSavedMethodInput): Promise<PaymentResult<PaymentIntent>> =>
      call(async (stripe) => {
        const intent = await stripe.paymentIntents.create(
          {
            amount: input.amountPence,
            currency: input.currency ?? 'gbp',
            customer: input.customerId,
            payment_method: input.paymentMethodId,
            confirm: true,
            ...(input.onSession
              ? // Somebody is here, so a card that needs a redirect is not one to offer them.
                { automatic_payment_methods: { enabled: true, allow_redirects: 'never' as const } }
              : // Nobody is at the keyboard: the bank is told so, and may still ask for them.
                { off_session: true }),
            metadata: input.metadata ?? {},
          },
          { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
        );
        return asIntent(intent, input.accountId);
      }),

    refund: (input: RefundInput): Promise<PaymentResult<Refund>> =>
      call(async (stripe) => {
        const refund = await stripe.refunds.create(
          {
            payment_intent: input.paymentIntentId,
            ...(input.amountPence === undefined ? {} : { amount: input.amountPence }),
            ...(input.reason ? { reason: input.reason } : {}),
            metadata: input.metadata ?? {},
          },
          { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
        );
        return {
          id: refund.id,
          paymentIntentId: input.paymentIntentId,
          amountPence: refund.amount,
          status: refundStatus(refund.status),
        };
      }),

    verifyWebhook: (input): Promise<PaymentResult<WebhookEvent>> =>
      call(async (stripe) => {
        // On the raw body, always: a parsed and re-serialised body is a different body (R-11).
        const event = await stripe.webhooks.constructEventAsync(input.body, input.signature, input.secret);
        return {
          id: event.id,
          type: event.type,
          accountId: event.account ?? null,
          data: event.data.object as unknown as Record<string, unknown>,
          createdAt: new Date(event.created * 1000),
        };
      }),
  };
}
