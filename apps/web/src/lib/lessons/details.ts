import 'server-only';
import type { BookingStatus, PaymentStatus } from '@repo/core/diary';
import { cancellationRules, type CancellationRules } from '@/lib/booking/rules';
import { learnerCard } from '@/lib/learners/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Everything the lesson sheet shows about one lesson (DIA-04, LRN-02, D-166): when and what it
 * is, where the money stands, where to pick the learner up, how to reach them, and what a
 * cancellation would cost. Read when the sheet opens rather than with every lesson in a list, so
 * a diary or a day never carries phone numbers it does not show.
 */
export interface LessonDetails {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  kind: string;
  source: string;
  lessonType: string;
  pricePence: number;
  learner: { id: string; name: string; phone: string | null; email: string | null };
  pickup: { label: string; address: string | null; postcode: string | null } | null;
  rules: CancellationRules;
  /** A reminder may go by text: the Business's plan has texts, and the learner has a number (NTF-01). */
  textReminders: boolean;
}

interface Row {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: string;
  price_pence: number;
  learner_id: string;
  instructor_id: string;
  lesson_types: { name: string; kind: string };
  pickup_points: { label: string; address: string | null; postcode: string | null } | null;
}

/** One lesson, or null for one this person may not see: the policies decide, not this code. */
export async function lessonDetails(bookingId: string): Promise<LessonDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, payment_status, source, price_pence, learner_id, instructor_id, lesson_types(name, kind), pickup_points(label, address, postcode)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  const row = data as unknown as Row;

  const [card, rules, options] = await Promise.all([
    learnerCard(row.learner_id),
    cancellationRules(row.instructor_id),
    // Whether the plan has texts, and never the plan itself, which is the owner's (D-123).
    supabase.rpc('lesson_reminder_options', { p_booking_id: row.id }),
  ]);
  const phone = card?.phone ?? null;
  return {
    id: row.id,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    status: row.status,
    paymentStatus: row.payment_status,
    kind: row.lesson_types.kind,
    source: row.source,
    lessonType: row.lesson_types.name,
    pricePence: row.price_pence,
    learner: {
      id: row.learner_id,
      name: card?.fullName ?? 'Unnamed learner',
      phone,
      email: card?.email ?? null,
    },
    pickup: row.pickup_points,
    rules,
    textReminders: phone !== null && (options.data as { texts?: boolean } | null)?.texts === true,
  };
}
