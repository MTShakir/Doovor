'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { checkoutLesson, type CheckoutLesson } from '@/lib/payments/checkout';
import { fakeCardOutcome, paymentsProvider } from '@/lib/payments/provider';
import { deliverFakePaymentEvent } from '@/lib/payments/webhook';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

/** Hold the slot and check the lesson can be paid for, before any money is asked for (R-10). */
async function payableLesson(bookingId: string): Promise<Result<CheckoutLesson & { accountId: string }>> {
  const lesson = await checkoutLesson(bookingId);
  if (!lesson) return err('NOT_FOUND');
  if (lesson.paid) return err('VALIDATION_FAILED', 'That lesson is already paid for.');
  if (lesson.accountId === null) return err('NOT_ALLOWED', 'This instructor cannot take card payments yet.');

  const supabase = await createSupabaseServerClient();
  const held = await supabase.rpc('hold_booking_for_payment', { p_booking_id: lesson.bookingId });
  if (held.error) return err(parsePostgresError(held.error).code);

  return ok({ ...lesson, accountId: lesson.accountId });
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

/**
 * Starts paying for a lesson with a card typed in now (PAY-02, PAY-03, R-10, M3-05).
 *
 * The slot is held first, so nobody else can take it while a card is being typed, and the
 * payment carries the booking in its metadata, which is how the webhook knows what it was
 * for without trusting anything the browser says.
 */
export async function startCheckout(input: unknown): Promise<Result<Checkout>> {
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

  const intent = await provider.createCheckoutIntent({
    accountId: lesson.accountId,
    amountPence: lesson.pricePence,
    customerId: customer.data.customerId,
    savePaymentMethod: parsed.data.saveCard,
    metadata: { booking_id: lesson.bookingId, business_id: lesson.businessId },
    // One attempt per version of this lesson and per choice about the card: a retry reuses the
    // same payment (R-11), and changing one's mind about keeping the card is a new attempt,
    // because the provider refuses the same key with different instructions.
    idempotencyKey: `booking:${lesson.bookingId}:${String(lesson.pricePence)}:${parsed.data.saveCard ? 'keep' : 'once'}`,
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

/**
 * Pays for a lesson with a card the learner kept with this Business (PAY-02, M3-07).
 *
 * The card has to be one the provider holds for this learner on this Business's account: the
 * customer comes from their own `billing_customers` row, never from the browser, and the card
 * from that customer's own list. The learner is here pressing the button, so the bank is told
 * so. What confirms the lesson is the webhook, exactly as for a card typed in.
 */
export async function payWithSavedCard(input: unknown): Promise<Result<{ status: 'paid' | 'confirming' }>> {
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
    amountPence: lesson.pricePence,
    onSession: true,
    metadata: { booking_id: lesson.bookingId, business_id: lesson.businessId },
    // Pressing the button twice pays once (R-11).
    idempotencyKey: `booking:${lesson.bookingId}:${String(lesson.pricePence)}:card:${card.paymentMethodId}`,
  });

  if (!charged.ok) {
    if (charged.reason === 'AUTHENTICATION_REQUIRED') {
      return err('PAYMENT_FAILED', 'Your bank wants to check it is you. Use a different card to pay with your card details.');
    }
    if (charged.reason === 'DECLINED') return err('PAYMENT_FAILED', 'That card was refused. Use a different card.');
    return err('UNKNOWN', 'We could not take the payment. Try again.');
  }

  // A bank that asks for a check part way through cannot be answered from here yet (M3-23).
  if (charged.data.status === 'requires_action' || charged.data.status === 'requires_payment_method') {
    return err('PAYMENT_FAILED', 'Your bank wants to check it is you. Use a different card to pay with your card details.');
  }

  await recordAttempt(lesson.bookingId, charged.data.id, charged.data.amountPence);

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

  revalidatePath(`/app/learner/pay/${lesson.bookingId}`);
  revalidatePath('/app/learner/lessons');
  return ok({ status: serverEnv.PAYMENTS_PROVIDER === 'stripe' ? 'confirming' : 'paid' });
}

const testSchema = z.object({
  paymentIntentId: z.string().min(3).max(100),
  outcome: z.enum(['succeeded', 'failed']),
});

/**
 * Stands in for a card, while the fake provider is in use (M3-05).
 *
 * It does what Stripe does: the payment reaches its outcome and a signed event goes through
 * the same handler the webhook route uses. Nothing here writes to the database itself, so what
 * is being exercised is the real path from the provider to the booking. Not in production.
 */
export async function payWithTestCard(input: unknown): Promise<Result<{ outcome: string }>> {
  if (serverEnv.APP_ENV === 'production' || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return err('NOT_ALLOWED');
  }

  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  await requirePortal('learner');

  const intent = fakeCardOutcome(parsed.data.paymentIntentId, parsed.data.outcome);
  if (!intent) return err('NOT_FOUND');

  const delivered = await deliverFakePaymentEvent(intent, parsed.data.outcome);
  if (!delivered) return err('UNKNOWN', 'The payment did not go through. Try again.');

  const booking = intent.metadata.booking_id;
  if (booking) revalidatePath(`/app/learner/pay/${booking}`);
  revalidatePath('/app/learner/lessons');
  return ok({ outcome: parsed.data.outcome });
}
