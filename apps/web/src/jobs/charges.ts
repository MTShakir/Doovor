import 'server-only';
import { usableCards } from '@repo/core/cards';
import { serverEnv } from '@/env/server';
import { paymentsProvider } from '@/lib/payments/provider';
import { deliverFakePaymentEvent } from '@/lib/payments/webhook';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** One lesson due to be charged. */
interface Due {
  booking_id: string;
  business_id: string;
  account_id: string;
  /** Missing for a learner who never saved a card with this Business. */
  customer_id: string | null;
  amount_pence: number;
  starts_at: string;
}

export type FailedBecause = 'no_card' | 'expired_card' | 'declined' | 'authentication_required';

export interface KeptCardCharge {
  accountId: string;
  /** Missing for a learner who never saved a card with this Business. */
  customerId: string | null;
  amountPence: number;
  metadata: Record<string, string>;
  idempotencyKey: string;
  now: Date;
}

/**
 * Charges the newest card a learner keeps with a Business that still works, with nobody at the
 * keyboard (PAY-03, PAY-09). Taken, or on the way, says `charged`; the webhook records it, and
 * with the fake provider the event is sent here. Anything that stops it says why. A provider
 * that cannot be reached throws instead: nothing was decided, so the next run tries again.
 */
export async function chargeKeptCard(input: KeptCardCharge): Promise<{ charged: true } | { charged: false; reason: FailedBecause }> {
  if (input.customerId === null) return { charged: false, reason: 'no_card' };

  const provider = paymentsProvider();
  const listed = await provider.listSavedCards({ accountId: input.accountId, customerId: input.customerId });
  if (!listed.ok) {
    if (listed.reason === 'UNAVAILABLE' || listed.reason === 'NOT_CONFIGURED') {
      throw new Error(`Could not read a learner's cards: ${listed.message}`);
    }
    return { charged: false, reason: 'no_card' };
  }

  const [card] = usableCards(listed.data, input.now);
  if (!card) return { charged: false, reason: listed.data.length > 0 ? 'expired_card' : 'no_card' };

  const charged = await provider.chargeSavedMethod({
    accountId: input.accountId,
    customerId: input.customerId,
    paymentMethodId: card.paymentMethodId,
    amountPence: input.amountPence,
    metadata: input.metadata,
    idempotencyKey: input.idempotencyKey,
  });

  if (!charged.ok) {
    if (charged.reason === 'UNAVAILABLE' || charged.reason === 'NOT_CONFIGURED') {
      throw new Error(`Could not charge a lesson: ${charged.message}`);
    }
    return {
      charged: false,
      reason:
        charged.reason === 'AUTHENTICATION_REQUIRED' ? 'authentication_required' : charged.reason === 'NOT_FOUND' ? 'no_card' : 'declined',
    };
  }

  // A bank that wants its customer to confirm cannot be answered by nobody.
  if (charged.data.status === 'requires_action' || charged.data.status === 'requires_payment_method') {
    return { charged: false, reason: 'authentication_required' };
  }

  if (serverEnv.PAYMENTS_PROVIDER !== 'stripe' && charged.data.status === 'succeeded') {
    await deliverFakePaymentEvent(
      {
        id: charged.data.id,
        accountId: input.accountId,
        amountPence: charged.data.amountPence,
        metadata: charged.data.metadata,
      },
      'succeeded',
    );
  }
  return { charged: true };
}

export interface ChargeResult {
  /** Taken, or on the way: the webhook confirms each one. */
  charged: number;
  /** Could not be taken, so both sides were told and the learner asked to pay. */
  failed: number;
}

/**
 * Charges the lessons that are paid for the day before (PAY-03, M3-09).
 *
 * Each goes to the newest card the learner keeps with that Business that still works, with
 * nobody at the keyboard, under a key of its own, so a run that repeats charges once. A lesson
 * with nothing to charge, or a card that is refused or needs its holder to confirm it, is
 * written down as failed, which tells both of them and puts a way to pay in front of the learner.
 */
export async function chargeBeforeLessons(options: { withinHours?: number; now?: Date } = {}): Promise<ChargeResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_lessons_to_charge', { p_within_hours: options.withinHours ?? 24 });
  if (error) throw new Error(`Could not read the lessons to charge: ${error.message}`);

  const due = data as unknown as Due[];
  const now = options.now ?? new Date();
  const result: ChargeResult = { charged: 0, failed: 0 };

  for (const one of due) {
    const outcome = await chargeKeptCard({
      accountId: one.account_id,
      customerId: one.customer_id,
      amountPence: one.amount_pence,
      metadata: { booking_id: one.booking_id, business_id: one.business_id },
      idempotencyKey: `before-lesson:${one.booking_id}:${String(one.amount_pence)}`,
      now,
    });

    if (outcome.charged) {
      result.charged += 1;
      continue;
    }

    const marked = await supabase.rpc('system_record_charge_failed', { p_booking_id: one.booking_id, p_reason: outcome.reason });
    if (marked.error) throw new Error(`Could not record a charge that failed: ${marked.error.message}`);
    if (marked.data) result.failed += 1;
  }

  return result;
}
