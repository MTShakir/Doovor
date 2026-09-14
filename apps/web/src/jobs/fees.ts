import 'server-only';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { chargeKeptCard, type FailedBecause } from './charges';

/** What `system_fee_to_charge` answers. */
interface FeeToCharge {
  booking_id: string;
  business_id: string;
  account_id: string;
  /** Missing for a learner the Business keeps no card for. */
  customer_id: string | null;
  amount_pence: number;
  /** `cancelled` for a late cancellation, `no_show` for a lesson nobody came to. */
  kind: string;
}

export type FeeResult = { charged: true } | { charged: false; reason: FailedBecause | 'nothing_to_charge' };

/**
 * Charges the fee for a lesson called off late, or nobody came to, to the card the learner keeps
 * with the Business (PAY-09, M3-19).
 *
 * The database decided the fee and asked for it; this finds a card that works and charges it with
 * nobody at the keyboard, under a key of its own, so a retry charges once. The webhook records the
 * payment as for any card. A card that is refused, has run out or wants its holder to confirm is
 * written down, which tells both sides and asks the learner to pay on screen. No card at all is
 * not news: the fee is owed, and the learner was told so with the lesson.
 */
export async function chargeFee(bookingId: string, now = new Date()): Promise<FeeResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_fee_to_charge', { p_booking_id: bookingId });
  if (error) throw new Error(`Could not read the fee to charge: ${error.message}`);

  const fee = data as unknown as FeeToCharge | null;
  if (fee === null) return { charged: false, reason: 'nothing_to_charge' };

  const outcome = await chargeKeptCard({
    accountId: fee.account_id,
    customerId: fee.customer_id,
    amountPence: fee.amount_pence,
    metadata: { booking_id: fee.booking_id, business_id: fee.business_id, fee: fee.kind },
    idempotencyKey: `fee:${fee.booking_id}:${String(fee.amount_pence)}`,
    now,
  });
  if (outcome.charged || outcome.reason === 'no_card') return outcome;

  const marked = await supabase.rpc('system_record_fee_charge_failed', { p_booking_id: fee.booking_id, p_reason: outcome.reason });
  if (marked.error) throw new Error(`Could not record a fee that could not be charged: ${marked.error.message}`);
  return outcome;
}
