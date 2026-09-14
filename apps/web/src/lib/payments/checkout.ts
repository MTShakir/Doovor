import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CheckoutLesson {
  bookingId: string;
  businessId: string;
  businessName: string;
  accountId: string | null;
  instructorName: string;
  lessonType: string;
  startsAt: string;
  durationMinutes: number;
  pricePence: number;
  /** What the learner still owes: nothing, once it is paid. */
  paid: boolean;
  status: string;
  /** When the slot stops being held for them (R-10). */
  holdExpiresAt: string | null;
  /** When a request stops waiting for an answer (R-12). Null for anything but a request. */
  requestExpiresAt: string | null;
  /** Their card is authorised for this lesson: set aside by the bank, not yet taken (R-12). */
  authorised: boolean;
  /** The fee for calling it off late, for a lesson that was (R-06). */
  feePence: number;
  /** Money paid for it, as opposed to credit: what a fee can be kept from (PAY-09, M3-18). */
  paidPence: number;
  /** How that money was paid: to a card, or in person. */
  paidBy: 'card' | 'in_person' | null;
  /** Money going back or gone back (PAY-07), and whether any of it is still on its way. */
  refundPence: number;
  refundPending: boolean;
  /** The terms the lesson was booked on (PAY-03). */
  paymentMode: string;
  /** Where its money stands: a charge that failed says `failed` here. */
  paymentStatus: string;
}

/**
 * The lesson somebody is about to pay for (PAY-02, M3-05, M3-08). Read under row-level security,
 * so this can only ever be a lesson of theirs.
 */
export async function checkoutLesson(bookingId: string): Promise<CheckoutLesson | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookings')
    .select(
      'id, business_id, starts_at, ends_at, price_pence, fee_pence, status, payment_status, payment_mode, hold_expires_at, expires_at, instructor_profiles(display_name), lesson_types(name), businesses!bookings_business_id_fkey(name, stripe_account_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;

  // Their own payments and refunds only: row-level security shows a learner nobody else's.
  const [payments, refunds] = await Promise.all([
    supabase.from('payments').select('amount_pence, method, status').eq('booking_id', bookingId),
    supabase.from('refunds').select('amount_pence, kind, status').eq('booking_id', bookingId).in('status', ['pending', 'succeeded']),
  ]);
  const taken = (payments.data ?? []).filter((one) => ['paid', 'refunded', 'partially_refunded'].includes(one.status));
  const back = (refunds.data ?? []).filter((one) => one.kind !== 'credit');

  const paidStatuses = ['paid_card', 'paid_cash', 'paid_bank', 'paid_credit'];
  return {
    bookingId: data.id,
    businessId: data.business_id,
    businessName: data.businesses.name,
    accountId: data.businesses.stripe_account_id,
    instructorName: data.instructor_profiles.display_name,
    lessonType: data.lesson_types.name,
    startsAt: data.starts_at,
    durationMinutes: Math.round(
      (new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 60_000,
    ),
    pricePence: data.price_pence,
    paid: paidStatuses.includes(data.payment_status),
    status: data.status,
    holdExpiresAt: data.hold_expires_at,
    requestExpiresAt: data.status === 'requested' ? data.expires_at : null,
    authorised: (payments.data ?? []).some((one) => one.status === 'authorised'),
    feePence: data.fee_pence ?? 0,
    paidPence: taken.reduce((sum, one) => sum + one.amount_pence, 0),
    paidBy: taken.length === 0 ? null : taken.some((one) => one.method === 'card') ? 'card' : 'in_person',
    refundPence: back.reduce((sum, one) => sum + one.amount_pence, 0),
    refundPending: back.some((one) => one.status === 'pending'),
    paymentMode: data.payment_mode,
    paymentStatus: data.payment_status,
  };
}
