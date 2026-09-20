import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerTotals {
  /** Lessons that stand: a lesson called off or never answered was never a lesson (LRN-02). */
  booked: number;
  taken: number;
  /** What they have actually paid this Business, less anything given back, in pence. */
  paidPence: number;
}

/** The figures at the top of a learner's card (LRN-02, D-189), counted where they are kept. */
export async function learnerTotals(businessId: string, learnerId: string): Promise<LearnerTotals> {
  const supabase = await createSupabaseServerClient();
  const [lessons, payments] = await Promise.all([
    supabase
      .from('bookings')
      .select('status')
      .eq('business_id', businessId)
      .eq('learner_id', learnerId)
      .limit(1000),
    supabase
      .from('payments')
      .select('amount_pence, refunded_pence, status')
      .eq('business_id', businessId)
      .eq('learner_id', learnerId)
      .limit(1000),
  ]);

  const off = ['cancelled', 'declined', 'expired'];
  const rows = lessons.data ?? [];
  return {
    booked: rows.filter((row) => !off.includes(row.status)).length,
    taken: rows.filter((row) => row.status === 'completed').length,
    paidPence: (payments.data ?? [])
      .filter((row) => row.status === 'paid' || row.status === 'partially_refunded')
      .reduce((total, row) => total + row.amount_pence - row.refunded_pence, 0),
  };
}

export interface LearnerLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string;
  pricePence: number;
  lessonType: string;
  instructorName: string;
}

/**
 * This learner's lessons with this Business (LRN-02, D-189), newest first among those that have
 * been and soonest first among those to come, which is the order each list is read in.
 */
export async function learnerLessons(
  businessId: string,
  learnerId: string,
): Promise<{ upcoming: LearnerLesson[]; past: LearnerLesson[] }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookings')
    .select('id, starts_at, ends_at, status, payment_status, price_pence, lesson_types(name), instructor_profiles(display_name)')
    .eq('business_id', businessId)
    .eq('learner_id', learnerId)
    .order('starts_at', { ascending: false })
    .limit(200);

  const now = Date.now();
  const off = ['cancelled', 'declined', 'expired', 'no_show'];
  const all = (data ?? []).map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    paymentStatus: row.payment_status,
    pricePence: row.price_pence,
    lessonType: row.lesson_types.name,
    instructorName: row.instructor_profiles.display_name,
  }));

  return {
    upcoming: all
      .filter((lesson) => new Date(lesson.startsAt).getTime() >= now && !off.includes(lesson.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: all.filter((lesson) => new Date(lesson.startsAt).getTime() < now || off.includes(lesson.status)),
  };
}
