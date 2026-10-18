import 'server-only';
import { paymentsProvider } from '@/lib/payments/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** One payment attempt behind a hold that has run out. */
interface Attempt {
  payment_id: string;
  account_id: string;
  intent_id: string;
}

export interface HoldCancelResult {
  /** Attempts the provider agreed to call off. */
  cancelled: number;
}

/**
 * Calls off the payment behind a hold that ran out (R-10, D-274). The database gives the slot back
 * on its own schedule and raises `booking.hold_expired`; this is the part it cannot do, which is
 * telling the provider.
 *
 * An attempt that will not cancel because it was refused is left alone on purpose: it is a payment
 * that has already gone through, and the webhook is about to say so. One the provider could not be
 * reached about throws, so the runner tries again.
 */
export async function cancelExpiredHold(bookingId: string): Promise<HoldCancelResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_hold_cancellations', { p_booking_id: bookingId });
  if (error) throw new Error(`Could not read the holds to call off: ${error.message}`);

  const attempts = data as unknown as Attempt[];
  if (attempts.length === 0) return { cancelled: 0 };

  const provider = paymentsProvider();
  let cancelled = 0;
  for (const attempt of attempts) {
    const answer = await provider.cancelHold({
      accountId: attempt.account_id,
      paymentIntentId: attempt.intent_id,
    });
    if (!answer.ok) {
      if (answer.reason === 'UNAVAILABLE') throw new Error(`Could not reach the payment provider: ${answer.message}`);
      continue;
    }

    const marked = await supabase.rpc('system_record_payment_cancelled', { p_payment_id: attempt.payment_id });
    if (marked.error) throw new Error(`Could not record a cancelled payment: ${marked.error.message}`);
    if (marked.data) cancelled += 1;
  }

  return { cancelled };
}

interface RefundToSend {
  refund_id: string;
  status: string;
  kind: string;
  amount_pence: number;
  account_id: string | null;
  intent_id: string | null;
  booking_id: string | null;
  learner_id: string;
}

export interface RefundResult {
  sent: boolean;
  /** Why nothing was sent, when nothing was. */
  reason?: string;
}

/** What the provider called it, in the words the database keeps. */
function settledAs(status: string): string {
  if (status === 'canceled') return 'cancelled';
  if (status === 'failed' || status === 'pending') return status;
  return 'succeeded';
}

/**
 * Sends a refund the database has already decided on (PAY-07, R-10).
 *
 * The decision and the record are the database's; this asks the provider to move the money and
 * writes down what it said. It is safe to run twice: the refund goes under a key of its own, so
 * the provider gives back the same refund, and the database settles it once.
 */
export async function sendRefund(refundId: string): Promise<RefundResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_refund_to_send', { p_refund_id: refundId });
  if (error) throw new Error(`Could not read the refund: ${error.message}`);

  const refund = data as unknown as RefundToSend | null;
  if (refund === null) return { sent: false, reason: 'There is no such refund.' };
  if (refund.status !== 'pending') return { sent: false, reason: 'That refund has already been settled.' };
  // Credit goes back through the ledger, not through the provider (PAY-04, M3-17).
  if (refund.kind !== 'card') return { sent: false, reason: 'That refund is not a card refund.' };
  if (refund.account_id === null || refund.intent_id === null) {
    return { sent: false, reason: 'That refund has no payment to give back.' };
  }

  const answer = await paymentsProvider().refund({
    accountId: refund.account_id,
    paymentIntentId: refund.intent_id,
    amountPence: refund.amount_pence,
    reason: 'requested_by_customer',
    // So the provider's own events about it find this refund, however early they arrive (M3-17).
    metadata: { refund_id: refund.refund_id },
    idempotencyKey: `refund:${refund.refund_id}`,
  });
  // Left pending on purpose, so the next run tries again: money owed back is still owed back.
  if (!answer.ok) throw new Error(`The provider would not send the refund: ${answer.message}`);

  const settled = await supabase.rpc('system_settle_refund', {
    p_refund_id: refundId,
    p_provider_ref: answer.data.id,
    p_status: settledAs(answer.data.status),
  });
  if (settled.error) throw new Error(`Could not record the refund: ${settled.error.message}`);

  return { sent: true };
}
