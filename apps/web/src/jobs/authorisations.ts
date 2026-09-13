import 'server-only';
import { serverEnv } from '@/env/server';
import { paymentsProvider } from '@/lib/payments/provider';
import { deliverFakePaymentEvent } from '@/lib/payments/webhook';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** One authorisation with somewhere to go. */
interface Due {
  payment_id: string;
  booking_id: string;
  account_id: string;
  intent_id: string;
  amount_pence: number;
}

export interface AuthorisationResult {
  /** Taken, for lessons that were accepted. */
  captured: number;
  /** Let go, for requests that were declined, ran out or were cancelled. */
  released: number;
  /** Could not be taken, so the lesson is owed for instead. */
  failed: number;
}

/**
 * Takes or lets go of every authorisation that has an answer (R-12, M3-08).
 *
 * The database says which is due for which, in one query; this only does the part that means
 * talking to the provider. Every call carries a key of its own, so a sweep that runs twice, or
 * two that overlap, capture once. What the capture did is written down by the webhook, which
 * the fake stands in for while there is no key.
 */
export async function settleAuthorisations(): Promise<AuthorisationResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_authorisations_due');
  if (error) throw new Error(`Could not read the authorisations that are due: ${error.message}`);

  const due = data as unknown as { capture: Due[]; release: Due[] };
  const provider = paymentsProvider();
  const result: AuthorisationResult = { captured: 0, released: 0, failed: 0 };

  for (const one of due.capture) {
    const taken = await provider.captureHold({
      accountId: one.account_id,
      paymentIntentId: one.intent_id,
      idempotencyKey: `capture:${one.payment_id}`,
    });

    if (taken.ok) {
      result.captured += 1;
      if (serverEnv.PAYMENTS_PROVIDER !== 'stripe') {
        await deliverFakePaymentEvent(
          {
            id: one.intent_id,
            accountId: one.account_id,
            amountPence: taken.data.amountPence,
            metadata: { booking_id: one.booking_id },
          },
          'succeeded',
        );
      }
      continue;
    }

    // A provider that cannot be reached is tried again on the next run; an authorisation it
    // says is not there to take has gone, and the lesson is owed for instead.
    if (taken.reason === 'UNAVAILABLE' || taken.reason === 'NOT_CONFIGURED') {
      throw new Error(`Could not capture a payment: ${taken.message}`);
    }
    const marked = await supabase.rpc('system_record_capture_failed', { p_payment_id: one.payment_id });
    if (marked.error) throw new Error(`Could not record a failed capture: ${marked.error.message}`);
    if (marked.data) result.failed += 1;
  }

  for (const one of due.release) {
    const letGo = await provider.cancelHold({ accountId: one.account_id, paymentIntentId: one.intent_id });

    if (!letGo.ok && (letGo.reason === 'UNAVAILABLE' || letGo.reason === 'NOT_CONFIGURED')) {
      throw new Error(`Could not release an authorisation: ${letGo.message}`);
    }
    // Released, or already gone at the provider: either way nothing is held any more. One that
    // was taken after all is refunded by the webhook, because the lesson is not on.
    if (!letGo.ok && letGo.reason === 'DECLINED') continue;

    const marked = await supabase.rpc('system_record_payment_cancelled', { p_payment_id: one.payment_id });
    if (marked.error) throw new Error(`Could not record a released authorisation: ${marked.error.message}`);
    if (marked.data) result.released += 1;
  }

  return result;
}
