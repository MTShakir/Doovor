import 'server-only';
import { asksForCard, chosenPaymentMode } from '@repo/core/payment-modes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface MyLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string;
  instructorId: string;
  instructorName: string;
  lessonType: string;
  pricePence: number;
  pickup: string | null;
  durationMinutes: number;
  /** True when this Business can take a card, so an unpaid lesson can be paid for now. */
  canPayNow: boolean;
  /** The terms it was booked on, which decide what paying for it means (PAY-03). */
  paymentMode: string;
  /** For a lesson marked as a no-show, until when it can be disputed (R-09). */
  disputeUntil: string | null;
  /** Their dispute of a no-show, and how it was decided: `outcome` stays null until it is. */
  dispute: { outcome: 'waived' | 'kept' | null; note: string | null } | null;
}

/** The learner's own lessons (PRD 8.2). Row-level security answers for them, not this. */
export async function myLessons(): Promise<{ upcoming: MyLesson[]; past: MyLesson[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, payment_status, payment_mode, price_pence, dispute_until, instructor_id, instructor_profiles(display_name), lesson_types(name), pickup_points(label), businesses!bookings_business_id_fkey(stripe_charges_enabled, settings), no_show_disputes(outcome, note)',
    )
    .order('starts_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const now = Date.now();
  const off = ['cancelled', 'expired', 'declined', 'no_show'];
  const all = data.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMode: row.payment_mode,
    instructorId: row.instructor_id,
    instructorName: row.instructor_profiles.display_name,
    lessonType: row.lesson_types.name,
    pricePence: row.price_pence,
    pickup: row.pickup_points?.label ?? null,
    disputeUntil: row.dispute_until,
    dispute: row.no_show_disputes === null ? null : { outcome: row.no_show_disputes.outcome, note: row.no_show_disputes.note },
    durationMinutes: Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000),
    // A request is paid for with an authorisation, and one already authorised has nothing left
    // to do until it is answered (R-12).
    canPayNow:
      asksForCard({
        chargesEnabled: row.businesses.stripe_charges_enabled,
        mode: chosenPaymentMode(row.businesses.settings),
      }) &&
      (row.status === 'requested' ? ['unpaid', 'failed'] : ['unpaid', 'pending', 'failed']).includes(row.payment_status),
  }));

  return {
    upcoming: all
      .filter((lesson) => new Date(lesson.startsAt).getTime() >= now && !off.includes(lesson.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: all.filter((lesson) => new Date(lesson.startsAt).getTime() < now || off.includes(lesson.status)),
  };
}
