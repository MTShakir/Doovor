import Stripe from 'stripe';
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
  SubscriptionStatus,
} from './types.ts';

/**
 * Stripe Billing: an instructor paying us for Pro (9.18, D-231).
 *
 * The other direction from `payments/stripe.ts`. That one is Connect, where a learner pays a
 * Business and we never hold the money; this one is our own platform account taking a
 * subscription. No call here carries a connected account, which is the difference that matters.
 *
 * **Every price is built here from a pence figure the caller worked out.** Prices are made inline
 * from `price_data` rather than looked up by id, because what Pro costs depends on how long
 * somebody has been paying (D-206), and a price per loyalty step is a price list nobody could
 * keep straight. The amount still never comes from a browser: see `core/src/subscription.ts`.
 *
 * Nothing here throws at the app. A refused card is an ordinary thing that happens to people.
 */

export interface StripeBillingOptions {
  secretKey: string | undefined;
  /**
   * What the invoice line and the Stripe dashboard call it. Passed in rather than written here,
   * because the brand lives in one file and this package is not it.
   */
  productName: string;
  /** Pinned, so an API change is something we choose rather than something that happens. */
  apiVersion?: Stripe.LatestApiVersion;
  currency?: string;
  /** For tests: a client that is already made. */
  client?: Stripe;
}

/**
 * The API version this code was written against. Its own constant rather than the Connect one:
 * Billing and Connect are different products and there is no reason they must move together.
 */
export const stripeBillingApiVersion: Stripe.LatestApiVersion = '2026-08-26.dahlia';

/** Marks the one Pro product on the platform account, so it is found again rather than remade. */
const productMarker = 'platform_pro_subscription';

/** Something this code will not go on with. Not a Stripe failure: a bug here, or a shape we cannot use. */
class BillingInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingInvalid';
  }
}

function reasonFor(error: unknown): { reason: BillingFailure; message: string } {
  if (error instanceof BillingInvalid) {
    return { reason: 'invalid', message: error.message };
  }
  if (error instanceof Stripe.errors.StripeError) {
    // "No such customer" and "No such subscription" come back as a 400 with this code, not a 404,
    // so the code is what tells a missing thing from a malformed request.
    if (error.code === 'resource_missing') {
      return { reason: 'not_found', message: error.message };
    }
    if (error.type === 'StripeCardError') {
      return { reason: 'refused', message: error.message };
    }
    if (error.type === 'StripeSignatureVerificationError') {
      return { reason: 'invalid', message: 'That signature is not ours.' };
    }
    if (error.type === 'StripeInvalidRequestError') {
      return { reason: error.statusCode === 404 ? 'not_found' : 'invalid', message: error.message };
    }
    if (error.type === 'StripeAuthenticationError') {
      return { reason: 'unavailable', message: 'Stripe refused our key.' };
    }
    return { reason: 'unavailable', message: error.message };
  }
  return { reason: 'unavailable', message: error instanceof Error ? error.message : 'The request failed.' };
}

/**
 * Stripe's status in our words. Anything we do not recognise becomes 'canceled', which is the
 * one that carries no Pro: a status this code has not been taught is not a reason to give
 * somebody a paid plan. 'paused' and 'incomplete_expired' land here on purpose.
 */
const statuses: Record<string, SubscriptionStatus> = {
  incomplete: 'incomplete',
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
};

/** Only two intervals are ever asked for, so anything else is a month rather than a crash. */
function intervalOf(recurring: Stripe.Price.Recurring | null): 'month' | 'year' {
  return recurring?.interval === 'year' ? 'year' : 'month';
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

/**
 * A Stripe subscription in our shape.
 *
 * The period end comes off the first item, not off the subscription: in this API version a
 * subscription has no `current_period_end` of its own, because its items can bill on different
 * clocks. Ours has exactly one item, so the first one is the subscription's period.
 */
function asSubscription(subscription: Stripe.Subscription): Subscription {
  const item = subscription.items.data[0];
  const end = item?.current_period_end;
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer) ?? '',
    status: statuses[subscription.status] ?? 'canceled',
    interval: intervalOf(item?.price.recurring ?? null),
    unitAmountPence: item?.price.unit_amount ?? 0,
    currentPeriodEnd: typeof end === 'number' ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    metadata: subscription.metadata,
  };
}

/** An invoice that was paid, or nothing: an invoice for nobody's subscription is not ours. */
function asPaidInvoice(invoice: Stripe.Invoice): PaidInvoice | null {
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  if (subscriptionId === null) return null;
  const paidAt = invoice.status_transitions.paid_at;
  // Both balances are negative while a customer is in credit, so the difference between them is
  // what this invoice used: -2400 before and -1200 after is twelve pounds of credit spent.
  //
  // `ending_balance` is null until Stripe finalises the invoice, and until then how much credit
  // it used is not a fact yet. Nought rather than a guess, because the guess would be the whole
  // balance, and that would mark every banked month spent on an invoice that used none of them.
  const used = invoice.ending_balance === null ? 0 : invoice.ending_balance - invoice.starting_balance;
  return {
    id: invoice.id,
    subscriptionId,
    // What was taken after credit and discounts, which is nought when banked months covered it.
    paidPence: invoice.amount_paid,
    creditAppliedPence: Math.max(0, used),
    paidAt: typeof paidAt === 'number' ? new Date(paidAt * 1000) : new Date(),
  };
}

/**
 * Whether a string is safe to put in a Stripe search query. Business ids are UUIDs from our own
 * database and never reach here from a browser, so this is a belt on top of braces: a quote in
 * one would end the quoted term and change what the search means.
 */
function searchable(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export function stripeBillingProvider(options: StripeBillingOptions): BillingProvider {
  const client =
    options.client ??
    (options.secretKey
      ? new Stripe(options.secretKey, { apiVersion: options.apiVersion ?? stripeBillingApiVersion })
      : null);
  const currency = options.currency ?? 'gbp';

  /** Found once per process. A product is for ever; looking it up every checkout is a wasted call. */
  let productId: string | null = null;

  /** Every call goes the same way: try it, and turn whatever comes back into an answer. */
  async function call<T>(work: (stripe: Stripe) => Promise<T>): Promise<BillingResult<T>> {
    if (!client) return { ok: false, reason: 'unavailable', message: 'No Stripe key is set.' };
    try {
      return { ok: true, data: await work(client) };
    } catch (error) {
      return { ok: false, ...reasonFor(error) };
    }
  }

  /**
   * The one Pro product on the platform account. Prices are made per subscription because the
   * amount varies; the product they hang off does not, so a dashboard shows one product with
   * many prices rather than one product per subscriber.
   */
  async function theProduct(stripe: Stripe): Promise<string> {
    if (productId !== null) return productId;
    const found = await stripe.products.search({ query: `metadata['marker']:'${productMarker}'`, limit: 1 });
    const already = found.data[0];
    if (already) {
      productId = already.id;
      return productId;
    }
    const made = await stripe.products.create(
      { name: options.productName, metadata: { marker: productMarker } },
      { idempotencyKey: `billing-product:${productMarker}` },
    );
    productId = made.id;
    return productId;
  }

  /** Pence off the next invoice. Stripe keeps credit as a negative balance, hence the sign. */
  async function credit(stripe: Stripe, customerId: string, pence: number, reason: string): Promise<void> {
    const whole = Math.max(0, Math.trunc(pence));
    if (whole === 0) return;
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -whole,
      currency,
      description: reason,
    });
  }

  return {
    ensureCustomer({ businessId, email, name }): Promise<BillingResult<BillingCustomer>> {
      if (!searchable(businessId)) {
        return Promise.resolve({ ok: false, reason: 'invalid', message: 'That is not a Business id.' });
      }
      return call(async (stripe) => {
        // The app keeps the customer id, so this normally finds nothing and makes one. The search
        // is for the case where a customer was made and the row that was to hold its id was not:
        // without it, that Business would get a second customer and a split history.
        const found = await stripe.customers.search({
          query: `metadata['business_id']:'${businessId}'`,
          limit: 1,
        });
        const already = found.data[0];
        if (already) {
          await stripe.customers.update(already.id, { email, name });
          return { customerId: already.id };
        }
        const made = await stripe.customers.create(
          { email, name, metadata: { business_id: businessId } },
          // Two requests racing for the same Business get one customer, which the eventually
          // consistent search above cannot promise on its own.
          { idempotencyKey: `billing-customer:${businessId}` },
        );
        return { customerId: made.id };
      });
    },

    startCheckout(input: StartCheckoutInput): Promise<BillingResult<CheckoutSession>> {
      if (!Number.isInteger(input.unitAmountPence) || input.unitAmountPence <= 0) {
        return Promise.resolve({ ok: false, reason: 'invalid', message: 'A subscription needs a price in whole pence.' });
      }
      return call(async (stripe) => {
        // Credit goes on before the session, so the first invoice is made with it already there.
        await credit(stripe, input.customerId, input.creditPence, 'Months earned by referring people');
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: input.customerId,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                product: await theProduct(stripe),
                recurring: { interval: input.interval },
                unit_amount: input.unitAmountPence,
              },
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          // On the subscription as well as the session: every later event carries it, so a
          // webhook knows whose it is without a lookup table.
          subscription_data: { metadata: { business_id: input.businessId } },
          metadata: { business_id: input.businessId },
          client_reference_id: input.businessId,
        });
        if (session.url === null) {
          throw new BillingInvalid('Stripe made a checkout with nowhere to send anybody.');
        }
        return { url: session.url, sessionId: session.id };
      });
    },

    getSubscription(subscriptionId): Promise<BillingResult<Subscription>> {
      return call(async (stripe) => asSubscription(await stripe.subscriptions.retrieve(subscriptionId)));
    },

    setSubscriptionPrice({ subscriptionId, unitAmountPence }): Promise<BillingResult<Subscription>> {
      if (!Number.isInteger(unitAmountPence) || unitAmountPence <= 0) {
        return Promise.resolve({ ok: false, reason: 'invalid', message: 'A subscription needs a price in whole pence.' });
      }
      return call(async (stripe) => {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        const item = current.items.data[0];
        if (!item) throw new BillingInvalid('That subscription has nothing on it to price.');
        const updated = await stripe.subscriptions.update(subscriptionId, {
          items: [
            {
              id: item.id,
              price_data: {
                currency,
                product: idOf(item.price.product) ?? (await theProduct(stripe)),
                recurring: { interval: intervalOf(item.price.recurring) },
                unit_amount: unitAmountPence,
              },
            },
          ],
          // The new price is for the next period. Nobody is billed or refunded for changing it,
          // which is what makes the loyalty discount a discount rather than a transaction.
          proration_behavior: 'none',
        });
        return asSubscription(updated);
      });
    },

    setCancelAtPeriodEnd({ subscriptionId, cancel }): Promise<BillingResult<Subscription>> {
      return call(async (stripe) =>
        asSubscription(await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel })),
      );
    },

    addCredit({ customerId, pence, reason }): Promise<BillingResult<null>> {
      return call(async (stripe) => {
        await credit(stripe, customerId, pence, reason);
        return null;
      });
    },

    verifyWebhook({ body, signature, secret }): Promise<BillingResult<BillingWebhookEvent>> {
      return call(async (stripe) => {
        const event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        const answer: BillingWebhookEvent = { id: event.id, type: event.type, subscription: null, invoice: null };
        // Narrowed on the event's own type, so Stripe's types say what `data.object` is. The
        // alternative is asserting it, which is how a renamed field becomes a runtime surprise.
        switch (event.type) {
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted':
          case 'customer.subscription.paused':
          case 'customer.subscription.resumed':
            answer.subscription = asSubscription(event.data.object);
            break;
          case 'invoice.paid':
          case 'invoice.payment_succeeded':
            answer.invoice = asPaidInvoice(event.data.object);
            break;
          default:
            // Everything else is an event we take no action on. It still comes back, so the
            // route can answer 200 and say in the log that it was seen and ignored.
            break;
        }
        return answer;
      });
    },
  };
}
