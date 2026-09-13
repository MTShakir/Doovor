'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { checkoutLesson } from '@/lib/payments/checkout';
import { fakeCardOutcome, localWebhookSecret, paymentsProvider } from '@/lib/payments/provider';
import { handleProviderEvent } from '@/lib/payments/webhook';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const bookingSchema = z.object({ bookingId: z.uuid() });

export interface Checkout {
  /** What the Payment Element needs. Never logged, never stored. */
  clientSecret: string;
  amountPence: number;
  /** The account the money goes to, which the Payment Element has to be told about. */
  accountId: string;
}

/**
 * Starts paying for a lesson (PAY-02, PAY-03, R-10, M3-05).
 *
 * The slot is held first, so nobody else can take it while a card is being typed, and the
 * payment carries the booking in its metadata, which is how the webhook knows what it was
 * for without trusting anything the browser says.
 */
export async function startCheckout(input: unknown): Promise<Result<Checkout>> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();

  const lesson = await checkoutLesson(parsed.data.bookingId);
  if (!lesson) return err('NOT_FOUND');
  if (lesson.paid) return err('VALIDATION_FAILED', 'That lesson is already paid for.');
  if (lesson.accountId === null) return err('NOT_ALLOWED', 'This instructor cannot take card payments yet.');

  const held = await supabase.rpc('hold_booking_for_payment', { p_booking_id: lesson.bookingId });
  if (held.error) return err(parsePostgresError(held.error).code);

  const provider = paymentsProvider();
  const customer = await provider.ensureCustomer({
    accountId: lesson.accountId,
    reference: session.userId,
    email: session.email ?? undefined,
  });
  if (!customer.ok) return err('UNKNOWN', 'We could not start the payment. Try again.');

  // Kept so the same learner is the same customer next time they pay this Business (PAY-02).
  await supabase.rpc('set_billing_customer', {
    p_business_id: lesson.businessId,
    p_customer_id: customer.data.customerId,
  });

  const intent = await provider.createCheckoutIntent({
    accountId: lesson.accountId,
    amountPence: lesson.pricePence,
    customerId: customer.data.customerId,
    savePaymentMethod: true,
    metadata: { booking_id: lesson.bookingId, business_id: lesson.businessId },
    // One attempt per version of this lesson: a retry reuses the same payment (R-11).
    idempotencyKey: `booking:${lesson.bookingId}:${String(lesson.pricePence)}`,
    statementDescriptor: 'LESSON',
  });
  if (!intent.ok || intent.data.clientSecret === null) {
    return err('PAYMENT_FAILED', 'We could not start the payment. Try again.');
  }

  revalidatePath(`/app/learner/pay/${lesson.bookingId}`);
  return ok({
    clientSecret: intent.data.clientSecret,
    amountPence: intent.data.amountPence,
    accountId: lesson.accountId,
  });
}

const testSchema = z.object({
  paymentIntentId: z.string().min(3).max(100),
  outcome: z.enum(['succeeded', 'failed']),
});

/** The fake's signature, which is what the webhook route checks while the fake is in use. */
function sign(body: string, secret: string): string {
  let hash = 5381;
  for (const character of `${secret}.${body}`) {
    hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) % 0xffffffff;
  }
  return `fake_sig_${hash.toString(16)}`;
}

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

  const body = JSON.stringify({
    id: `evt_test_${intent.id}_${parsed.data.outcome}`,
    type: parsed.data.outcome === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: intent.id,
        amount: intent.amountPence,
        amount_received: intent.amountPence,
        metadata: intent.metadata,
      },
    },
  });

  const answer = await handleProviderEvent({ body, signature: sign(body, localWebhookSecret) });
  if (answer.status !== 200) return err('UNKNOWN', 'The payment did not go through. Try again.');

  const booking = intent.metadata.booking_id;
  if (booking) revalidatePath(`/app/learner/pay/${booking}`);
  revalidatePath('/app/learner/lessons');
  return ok({ outcome: parsed.data.outcome });
}
