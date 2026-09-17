'use server';

import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { packageOffer, type PackageOffer } from '@/lib/payments/packages';
import { fakeCardOutcome, paymentsProvider } from '@/lib/payments/provider';
import { deliverFakePaymentEvent } from '@/lib/payments/webhook';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Buying a package of lessons by card (PAY-04, PAY-12, R-11, M3-13).
 *
 * The payment is made on the Business's own account, as for a lesson, and says in its metadata
 * what it buys. The webhook turns it into credit, once; nothing here writes credit down.
 */

const startNowMessage = 'Tick "Start my lessons straight away" to buy this package.';

const purchaseSchema = z.object({
  packageId: z.uuid(),
  /** One per visit to the purchase screen, so pressing twice is one payment (R-11). */
  attemptId: z.uuid(),
  /** The learner asked for their lessons to start inside the fourteen days they can cancel in (D-086). */
  startNow: z.boolean(),
  /** The learner ticked "keep this card", which is theirs to tick (PAY-02, D-079). */
  saveCard: z.boolean().default(false),
});

export interface PackageCheckout {
  /** What the Payment Element needs. Never logged, never stored. */
  clientSecret: string;
  amountPence: number;
  /** The account the money goes to, which the Payment Element has to be told about. */
  accountId: string;
}

type Buyable = PackageOffer & { accountId: string };

async function buyable(packageId: string): Promise<Result<Buyable>> {
  const offer = await packageOffer(packageId);
  if (!offer) return err('NOT_FOUND');
  if (offer.suspended) return err('BUSINESS_SUSPENDED', `${offer.businessName} is not selling packages at the moment.`);
  if (!offer.onSale) return err('VALIDATION_FAILED', `${offer.businessName} no longer sells this package.`);
  if (offer.accountId === null) return err('NOT_ALLOWED', `${offer.businessName} cannot take card payments yet.`);
  return ok({ ...offer, accountId: offer.accountId });
}

/**
 * What the payment says it buys, which is what the webhook turns into credit. Written here, from
 * the package as the learner was shown it, never taken from the browser. The same for every press
 * of one attempt: the provider refuses a key it has seen with different details.
 */
function purchaseMetadata(offer: Buyable, learnerId: string): Record<string, string> {
  return {
    package_id: offer.packageId,
    business_id: offer.businessId,
    learner_id: learnerId,
    minutes: String(offer.minutes),
    ...(offer.expiryDays === null ? {} : { expiry_days: String(offer.expiryDays) }),
    starts_now: 'yes',
  };
}

function attemptKey(offer: Buyable, learnerId: string, attemptId: string, how: string): string {
  return `package:${offer.packageId}:${learnerId}:${attemptId}:${String(offer.pricePence)}:${how}`;
}

function refreshCredit(packageId: string): void {
  revalidatePath(`/app/learner/payments/packages/${packageId}`);
  revalidatePath('/app/learner/payments');
}

/** Starts paying for a package with a card typed in now. */
export async function startPackageCheckout(input: unknown): Promise<Result<PackageCheckout>> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  if (!parsed.data.startNow) return err('VALIDATION_FAILED', startNowMessage);

  const { session } = await requirePortal('learner');
  const found = await buyable(parsed.data.packageId);
  if (!found.ok) return found;
  const offer = found.data;

  const provider = paymentsProvider();
  const customer = await provider.ensureCustomer({
    accountId: offer.accountId,
    reference: session.userId,
    email: session.email ?? undefined,
  });
  if (!customer.ok) return err('UNKNOWN', 'We could not start the payment. Try again.');

  // Kept so the same learner is the same customer next time they pay this Business (PAY-02).
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('set_billing_customer', {
    p_business_id: offer.businessId,
    p_customer_id: customer.data.customerId,
  });

  const intent = await provider.createCheckoutIntent({
    accountId: offer.accountId,
    amountPence: offer.pricePence,
    customerId: customer.data.customerId,
    holdOnly: false,
    savePaymentMethod: parsed.data.saveCard,
    metadata: purchaseMetadata(offer, session.userId),
    idempotencyKey: attemptKey(offer, session.userId, parsed.data.attemptId, parsed.data.saveCard ? 'keep' : 'once'),
    statementDescriptor: 'LESSONS',
  });
  if (!intent.ok || intent.data.clientSecret === null) {
    return err('PAYMENT_FAILED', 'We could not start the payment. Try again.');
  }

  return ok({ clientSecret: intent.data.clientSecret, amountPence: intent.data.amountPence, accountId: offer.accountId });
}

const savedCardSchema = purchaseSchema.omit({ saveCard: true }).extend({
  paymentMethodId: z.string().min(3).max(100),
});

const needsCheck = 'Your bank wants to check it is you. Use a different card to pay with your card details.';

/**
 * Pays for a package with a card the learner kept with this Business (PAY-02). The card has to be
 * one the provider holds for this learner on this Business's account, found from their own
 * `billing_customers` row, never from the browser.
 */
export type SavedCardPurchase =
  | { status: 'paid' | 'confirming' }
  /** The bank wants the learner, who is on the screen, to check it is them (M3-23). */
  | { status: 'check'; clientSecret: string; accountId: string };

export async function payPackageWithSavedCard(input: unknown): Promise<Result<SavedCardPurchase>> {
  const parsed = savedCardSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  if (!parsed.data.startNow) return err('VALIDATION_FAILED', startNowMessage);

  const { session } = await requirePortal('learner');
  const found = await buyable(parsed.data.packageId);
  if (!found.ok) return found;
  const offer = found.data;

  const kept = await keptCardsWith(offer.businessId);
  const card = kept?.cards.find((one) => one.paymentMethodId === parsed.data.paymentMethodId);
  if (!kept || !card) return err('NOT_FOUND', 'That card is not saved any more. Use a different card.');

  const charged = await paymentsProvider().chargeSavedMethod({
    accountId: kept.accountId,
    customerId: kept.customerId,
    paymentMethodId: card.paymentMethodId,
    amountPence: offer.pricePence,
    holdOnly: false,
    onSession: true,
    metadata: purchaseMetadata(offer, session.userId),
    idempotencyKey: attemptKey(offer, session.userId, parsed.data.attemptId, `card:${card.paymentMethodId}`),
  });

  if (!charged.ok) {
    if (charged.reason === 'AUTHENTICATION_REQUIRED') return err('PAYMENT_FAILED', needsCheck);
    if (charged.reason === 'DECLINED') return err('PAYMENT_FAILED', 'That card was refused. Use a different card.');
    return err('UNKNOWN', 'We could not take the payment. Try again.');
  }
  // The bank asks for a check part way through: the learner is here, so the screen asks them,
  // and the webhook adds the credit once they have (M3-23).
  if (charged.data.status === 'requires_action' && charged.data.clientSecret !== null) {
    return ok({ status: 'check', clientSecret: charged.data.clientSecret, accountId: kept.accountId });
  }
  if (charged.data.status !== 'succeeded' && charged.data.status !== 'processing') {
    return err('PAYMENT_FAILED', needsCheck);
  }

  // With the fake nobody sends the event, so it is sent here, through the same handler.
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe' && charged.data.status === 'succeeded') {
    const delivered = await deliverFakePaymentEvent(
      {
        id: charged.data.id,
        accountId: kept.accountId,
        amountPence: charged.data.amountPence,
        metadata: charged.data.metadata,
      },
      'succeeded',
    );
    if (!delivered) return err('UNKNOWN', 'The payment did not go through. Try again.');
  }

  refreshCredit(offer.packageId);
  return ok({ status: serverEnv.PAYMENTS_PROVIDER === 'stripe' ? 'confirming' : 'paid' });
}

const testSchema = z.object({
  packageId: z.uuid(),
  paymentIntentId: z.string().min(3).max(100),
  outcome: z.enum(['succeeded', 'failed']),
});

/**
 * Stands in for a card while the fake provider is in use, the way the lesson screen's does
 * (M3-05): the payment reaches its outcome and a signed event goes through the webhook's own
 * handler. Not in production.
 */
export async function payPackageWithTestCard(input: unknown): Promise<Result<{ outcome: 'succeeded' | 'failed' }>> {
  if (serverEnv.APP_ENV === 'production' || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return err('NOT_ALLOWED');
  }
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  await requirePortal('learner');

  const intent = fakeCardOutcome(parsed.data.paymentIntentId, parsed.data.outcome);
  if (intent?.metadata.package_id !== parsed.data.packageId) return err('NOT_FOUND');

  const delivered = await deliverFakePaymentEvent(intent, parsed.data.outcome);
  if (!delivered) return err('UNKNOWN', 'The payment did not go through. Try again.');

  refreshCredit(parsed.data.packageId);
  return ok({ outcome: parsed.data.outcome });
}
