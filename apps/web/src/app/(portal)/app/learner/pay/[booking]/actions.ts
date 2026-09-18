'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { checkoutLesson, type CheckoutLesson } from '@/lib/payments/checkout';
import { fakeCardOutcome, fakeCardSetupDone, paymentsProvider } from '@/lib/payments/provider';
import { deliverFakePaymentEvent } from '@/lib/payments/webhook';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refuseWhileViewing } from '@/lib/auth/view-as';

const checkoutSchema = z.object({
  bookingId: z.uuid(),
  /** The learner ticked "keep this card", which is theirs to tick (PAY-02, D-079). */
  saveCard: z.boolean().default(false),
});

export interface Checkout {
  /** What the Payment Element needs. Never logged, never stored. */
  clientSecret: string;
  amountPence: number;
  /** The account the money goes to, which the Payment Element has to be told about. */
  accountId: string;
}

type Payable = CheckoutLesson & { accountId: string; request: boolean };

/**
 * Checks the lesson can be paid for before any money is asked for, and holds the slot for a
 * lesson that is on (R-10). A request holds its own slot until it is answered, and is paid for
 * with an authorisation rather than a payment (R-12). A fee for a lesson called off late or nobody
 * came to has no slot to hold (PAY-09).
 */
async function payableLesson(bookingId: string): Promise<Result<Payable>> {
  const lesson = await checkoutLesson(bookingId);
  if (!lesson) return err('NOT_FOUND');
  if (lesson.paid) return err('VALIDATION_FAILED', 'That lesson is already paid for.');
  if (lesson.authorised) return err('VALIDATION_FAILED', 'Your card is already authorised for that lesson.');
  if (lesson.accountId === null) return err('NOT_ALLOWED', 'This instructor cannot take card payments yet.');

  const request = lesson.status === 'requested';
  if (!request && lesson.feeOwed === null) {
    const supabase = await createSupabaseServerClient();
    const held = await supabase.rpc('hold_booking_for_payment', { p_booking_id: lesson.bookingId });
    if (held.error) return err(parsePostgresError(held.error).code);
  }

  return ok({ ...lesson, accountId: lesson.accountId, request });
}

/**
 * Written down before any money moves, so the sweep that gives a slot back can call the attempt
 * off with it (R-10). A record of an attempt, not of money. Safe if the webhook got there first.
 */
async function recordAttempt(bookingId: string, intentId: string, amountPence: number): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('set_payment_intent', {
    p_booking_id: bookingId,
    p_provider_ref: intentId,
    p_amount_pence: amountPence,
  });
}

/** What a payment says it is for. A fee says which, so the provider's records do too. */
function metadataFor(lesson: Payable): Record<string, string> {
  const base = { booking_id: lesson.bookingId, business_id: lesson.businessId };
  return lesson.feeOwed === null ? base : { ...base, fee: lesson.status };
}

/** The start of an attempt's key: a fee is not the lesson, so paying one never reuses a lesson's attempt. */
function attemptFor(lesson: Payable): string {
  return `${lesson.feeOwed === null ? 'booking' : 'fee'}:${lesson.bookingId}`;
}

/**
 * Starts paying for a lesson with a card typed in now (PAY-02, PAY-03, R-10, R-12, M3-05).
 *
 * The payment carries the booking in its metadata, which is how the webhook knows what it was
 * for without trusting anything the browser says. For a request, the card is authorised and
 * not charged: the money is taken only if the instructor accepts.
 */
export async function startCheckout(input: unknown): Promise<Result<Checkout>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { session } = await requirePortal('learner');
  const payable = await payableLesson(parsed.data.bookingId);
  if (!payable.ok) return payable;
  const lesson = payable.data;

  const provider = paymentsProvider();
  const customer = await provider.ensureCustomer({
    accountId: lesson.accountId,
    reference: session.userId,
    email: session.email ?? undefined,
  });
  if (!customer.ok) return err('UNKNOWN', 'We could not start the payment. Try again.');

  // Kept so the same learner is the same customer next time they pay this Business (PAY-02).
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('set_billing_customer', {
    p_business_id: lesson.businessId,
    p_customer_id: customer.data.customerId,
  });

  const keep = parsed.data.saveCard ? 'keep' : 'once';
  const intent = await provider.createCheckoutIntent({
    accountId: lesson.accountId,
    amountPence: lesson.amountPence,
    customerId: customer.data.customerId,
    holdOnly: lesson.request,
    savePaymentMethod: parsed.data.saveCard,
    metadata: metadataFor(lesson),
    // One attempt per version of this lesson and per choice about the card: a retry reuses the
    // same payment (R-11), and changing one's mind about keeping the card is a new attempt,
    // because the provider refuses the same key with different instructions.
    idempotencyKey: `${attemptFor(lesson)}:${String(lesson.amountPence)}:${keep}:${lesson.request ? 'hold' : 'take'}`,
    statementDescriptor: 'LESSON',
  });
  if (!intent.ok || intent.data.clientSecret === null) {
    return err('PAYMENT_FAILED', 'We could not start the payment. Try again.');
  }

  await recordAttempt(lesson.bookingId, intent.data.id, intent.data.amountPence);

  revalidatePath(`/app/learner/pay/${lesson.bookingId}`);
  return ok({
    clientSecret: intent.data.clientSecret,
    amountPence: intent.data.amountPence,
    accountId: lesson.accountId,
  });
}

const savedCardSchema = z.object({
  bookingId: z.uuid(),
  paymentMethodId: z.string().min(3).max(100),
});

const needsCheck = 'Your bank wants to check it is you. Use a different card to pay with your card details.';

/**
 * Pays for a lesson with a card the learner kept with this Business (PAY-02, M3-07), or
 * authorises it for a request (R-12, M3-08).
 *
 * The card has to be one the provider holds for this learner on this Business's account: the
 * customer comes from their own `billing_customers` row, never from the browser, and the card
 * from that customer's own list. The learner is here pressing the button, so the bank is told
 * so. What records the payment is the webhook, exactly as for a card typed in.
 */
export type SavedCardPayment =
  | { status: 'paid' | 'authorised' | 'confirming' }
  /** The bank wants the learner, who is on the screen, to check it is them (M3-23). */
  | { status: 'check'; clientSecret: string; accountId: string };

export async function payWithSavedCard(input: unknown): Promise<Result<SavedCardPayment>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = savedCardSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  const payable = await payableLesson(parsed.data.bookingId);
  if (!payable.ok) return payable;
  const lesson = payable.data;

  const kept = await keptCardsWith(lesson.businessId);
  const card = kept?.cards.find((one) => one.paymentMethodId === parsed.data.paymentMethodId);
  if (!kept || !card) return err('NOT_FOUND', 'That card is not saved any more. Use a different card.');

  const charged = await paymentsProvider().chargeSavedMethod({
    accountId: kept.accountId,
    customerId: kept.customerId,
    paymentMethodId: card.paymentMethodId,
    amountPence: lesson.amountPence,
    holdOnly: lesson.request,
    onSession: true,
    metadata: metadataFor(lesson),
    // Pressing the button twice pays once (R-11).
    idempotencyKey: `${attemptFor(lesson)}:${String(lesson.amountPence)}:card:${card.paymentMethodId}:${lesson.request ? 'hold' : 'take'}`,
  });

  if (!charged.ok) {
    if (charged.reason === 'AUTHENTICATION_REQUIRED') return err('PAYMENT_FAILED', needsCheck);
    if (charged.reason === 'DECLINED') return err('PAYMENT_FAILED', 'That card was refused. Use a different card.');
    return err('UNKNOWN', 'We could not take the payment. Try again.');
  }

  const went = lesson.request ? 'requires_capture' : 'succeeded';
  // The bank asks for a check part way through: the learner is here, so the screen asks them,
  // and the webhook records the payment once they have (M3-23).
  if (charged.data.status === 'requires_action' && charged.data.clientSecret !== null) {
    await recordAttempt(lesson.bookingId, charged.data.id, charged.data.amountPence);
    return ok({ status: 'check', clientSecret: charged.data.clientSecret, accountId: kept.accountId });
  }
  if (charged.data.status !== went && charged.data.status !== 'processing') {
    return err('PAYMENT_FAILED', needsCheck);
  }

  await recordAttempt(lesson.bookingId, charged.data.id, charged.data.amountPence);

  // With the fake nobody sends the event, so it is sent here, through the same handler.
  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe' && charged.data.status === went) {
    const delivered = await deliverFakePaymentEvent(
      {
        id: charged.data.id,
        accountId: kept.accountId,
        amountPence: charged.data.amountPence,
        metadata: charged.data.metadata,
      },
      lesson.request ? 'authorised' : 'succeeded',
    );
    if (!delivered) return err('UNKNOWN', 'The payment did not go through. Try again.');
  }

  revalidatePath(`/app/learner/pay/${lesson.bookingId}`);
  revalidatePath('/app/learner/lessons');
  revalidatePath('/app/learner/payments');
  if (serverEnv.PAYMENTS_PROVIDER === 'stripe') return ok({ status: 'confirming' });
  return ok({ status: lesson.request ? 'authorised' : 'paid' });
}

const setupSchema = z.object({ bookingId: z.uuid() });

/**
 * Starts saving a card for a lesson that is charged the day before (PAY-03, M3-09).
 *
 * Nothing is taken now. The card is kept with this Business against this learner, the way a
 * card kept at checkout is (D-080), and the charge made later is the one the learner is told
 * about on this screen: that is their agreement to it.
 */
export async function startCardSetup(input: unknown): Promise<Result<{ setupId: string; clientSecret: string; accountId: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { session } = await requirePortal('learner');
  const lesson = await checkoutLesson(parsed.data.bookingId);
  if (!lesson) return err('NOT_FOUND');
  if (lesson.paymentMode !== 'before_lesson' || lesson.paid) {
    return err('VALIDATION_FAILED', 'This lesson is not charged before it starts.');
  }
  if (lesson.accountId === null) return err('NOT_ALLOWED', 'This instructor cannot take card payments yet.');

  const provider = paymentsProvider();
  const customer = await provider.ensureCustomer({
    accountId: lesson.accountId,
    reference: session.userId,
    email: session.email ?? undefined,
  });
  if (!customer.ok) return err('UNKNOWN', 'We could not start saving your card. Try again.');

  const supabase = await createSupabaseServerClient();
  await supabase.rpc('set_billing_customer', {
    p_business_id: lesson.businessId,
    p_customer_id: customer.data.customerId,
  });

  const setup = await provider.createCardSetup({
    accountId: lesson.accountId,
    customerId: customer.data.customerId,
    metadata: { booking_id: lesson.bookingId, business_id: lesson.businessId },
  });
  if (!setup.ok || setup.data.clientSecret === null) {
    return err('UNKNOWN', 'We could not start saving your card. Try again.');
  }

  return ok({ setupId: setup.data.id, clientSecret: setup.data.clientSecret, accountId: lesson.accountId });
}

const testSetupSchema = z.object({ bookingId: z.uuid(), setupId: z.string().min(3).max(100) });

/** Stands in for a card being saved, while the fake provider is in use (M3-09). Not in production. */
export async function saveTestCard(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  if (serverEnv.APP_ENV === 'production' || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return err('NOT_ALLOWED');
  }
  const parsed = testSetupSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  await requirePortal('learner');

  if (!fakeCardSetupDone(parsed.data.setupId)) return err('NOT_FOUND');
  revalidatePath(`/app/learner/pay/${parsed.data.bookingId}`);
  revalidatePath('/app/learner/payments');
  return ok(null);
}

const testSchema = z.object({
  paymentIntentId: z.string().min(3).max(100),
  outcome: z.enum(['succeeded', 'failed']),
});

/**
 * Stands in for a card, while the fake provider is in use (M3-05).
 *
 * It does what Stripe does: the payment reaches its outcome and a signed event goes through
 * the same handler the webhook route uses. A card that goes through for a request is held, not
 * taken, and the event says so. Nothing here writes to the database itself. Not in production.
 */
export async function payWithTestCard(
  input: unknown,
): Promise<Result<{ outcome: 'succeeded' | 'authorised' | 'failed' }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  if (serverEnv.APP_ENV === 'production' || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return err('NOT_ALLOWED');
  }

  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  await requirePortal('learner');

  const intent = fakeCardOutcome(parsed.data.paymentIntentId, parsed.data.outcome);
  if (!intent) return err('NOT_FOUND');

  const outcome =
    parsed.data.outcome === 'failed' ? 'failed' : intent.status === 'requires_capture' ? 'authorised' : 'succeeded';
  const delivered = await deliverFakePaymentEvent(intent, outcome);
  if (!delivered) return err('UNKNOWN', 'The payment did not go through. Try again.');

  const booking = intent.metadata.booking_id;
  if (booking) revalidatePath(`/app/learner/pay/${booking}`);
  revalidatePath('/app/learner/lessons');
  return ok({ outcome });
}
