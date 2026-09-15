import 'server-only';
import type { DiaryLesson } from '@repo/core/diary';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface DiaryEntry extends DiaryLesson {
  learnerName: string;
  lessonType: string;
  instructorId: string;
  instructorName: string;
  pickup: string | null;
  pricePence: number;
}

/**
 * Lessons in a window, for whichever instructors were asked for (DIA-03, M1-19).
 *
 * Row-level security decides what actually comes back: an instructor sees their own
 * Business, and a school owner or manager sees everyone who teaches for them.
 */
export async function lessonsBetween(from: Date, to: Date, instructorIds?: string[]): Promise<DiaryEntry[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('bookings')
    .select(
      'id, instructor_id, starts_at, ends_at, status, payment_status, source, price_pence, users!bookings_learner_id_fkey(full_name), lesson_types(name, kind), instructor_profiles(display_name), pickup_points(label)',
    )
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at');
  if (instructorIds?.length) query = query.in('instructor_id', instructorIds);

  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    instructorId: row.instructor_id,
    instructorName: row.instructor_profiles.display_name,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    learnerName: learnerName(row.users),
    lessonType: row.lesson_types.name,
    pickup: row.pickup_points?.label ?? null,
    pricePence: row.price_pence,
    facts: {
      status: row.status,
      paymentStatus: row.payment_status,
      kind: row.lesson_types.kind,
      source: row.source,
    },
  }));
}

/**
 * Who a lesson is with, as the diary says it. The generated types promise a learner, but
 * row-level security decides whether one comes back: the lesson's instructor and the people who
 * run the Business always get the name (D-097), and a lesson that ever arrives without it shows
 * under a neutral label rather than taking the whole diary down.
 */
function learnerName(learner: { full_name: string } | null): string {
  return learner === null || learner.full_name === '' ? 'Unnamed learner' : learner.full_name;
}
