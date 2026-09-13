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
}

/**
 * The lesson somebody is about to pay for (PAY-02, M3-05). Read under row-level security, so
 * this can only ever be a lesson of theirs.
 */
export async function checkoutLesson(bookingId: string): Promise<CheckoutLesson | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookings')
    .select(
      'id, business_id, starts_at, ends_at, price_pence, status, payment_status, hold_expires_at, instructor_profiles(display_name), lesson_types(name), businesses!bookings_business_id_fkey(name, stripe_account_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;

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
  };
}
