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
  /** What they paid has gone back, or is on its way back (PAY-07). */
  refunded: boolean;
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
      'id, business_id, starts_at, ends_at, price_pence, status, payment_status, payment_mode, hold_expires_at, expires_at, instructor_profiles(display_name), lesson_types(name), businesses!bookings_business_id_fkey(name, stripe_account_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;

  // Their own payments only: row-level security shows a learner nobody else's.
  const held = await supabase
    .from('payments')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('status', 'authorised')
    .limit(1);

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
    authorised: (held.data ?? []).length > 0,
    refunded: data.payment_status === 'refunded' || data.payment_status === 'partially_refunded',
    paymentMode: data.payment_mode,
    paymentStatus: data.payment_status,
  };
}
