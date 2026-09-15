import 'server-only';
import type { AccessContext } from '@repo/db';
import type { BookingStatus, LessonFacts, PaymentStatus } from '@repo/core/diary';
import { addDaysToLocalDate, localToUtc, todayInZone } from '@repo/core/time';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A lesson as the instructor teaching it needs it (PRD 7.5, 10.2, M4-04): who, when, where to
 * pick them up, where the money stands, and whether its record is saved. Plain data, with times
 * as ISO strings, so the same shape can come from the database now and from the phone's own
 * store when there is no signal (M4-09).
 */
export interface TeachingLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  learnerName: string;
  lessonType: string;
  pickup: { label: string; address: string | null; postcode: string | null } | null;
  facts: LessonFacts;
  recorded: boolean;
}

/** The instructor profiles somebody teaches as, in any Business. */
export function teachingProfiles(access: AccessContext): string[] {
  return access.memberships.flatMap((membership) => (membership.instructorProfileId === null ? [] : [membership.instructorProfileId]));
}

const columns =
  'id, starts_at, ends_at, status, payment_status, source, users!bookings_learner_id_fkey(full_name), lesson_types(name, kind), pickup_points(label, address, postcode), lesson_records(id)';

interface Row {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: string;
  users: { full_name: string } | null;
  lesson_types: { name: string; kind: string };
  pickup_points: { label: string; address: string | null; postcode: string | null } | null;
  lesson_records: { id: string } | null;
}

function teachingLesson(row: Row): TeachingLesson {
  return {
    id: row.id,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    // Row-level security decides whether a name comes back; a lesson without one still shows.
    learnerName: row.users?.full_name || 'Unnamed learner',
    lessonType: row.lesson_types.name,
    pickup: row.pickup_points,
    facts: { status: row.status, paymentStatus: row.payment_status, kind: row.lesson_types.kind, source: row.source },
    recorded: row.lesson_records !== null,
  };
}

/** Today's lessons in London for the profiles given, in the order they happen. */
export async function todaysLessons(profileIds: string[], now = new Date()): Promise<TeachingLesson[]> {
  if (profileIds.length === 0) return [];
  const today = todayInZone(now);
  const from = localToUtc(today, '00:00');
  const to = localToUtc(addDaysToLocalDate(today, 1), '00:00');
  // Midnight exists on every day in London: the clocks change at 01:00 and 02:00.
  if (from === null || to === null) return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookings')
    .select(columns)
    .in('instructor_id', profileIds)
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .not('status', 'in', '(requested,pending_payment,declined,expired)')
    .order('starts_at');
  return ((data ?? []) as unknown as Row[]).map(teachingLesson);
}

/** One lesson the profiles given teach, or null for one they do not. */
export async function lessonTaughtBy(bookingId: string, profileIds: string[]): Promise<TeachingLesson | null> {
  if (profileIds.length === 0) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('bookings').select(columns).eq('id', bookingId).in('instructor_id', profileIds).maybeSingle();
  return data === null ? null : teachingLesson(data);
}

/** Whether a lesson's booked time is over, so it is recorded rather than taught. */
export function lessonHasEnded(lesson: TeachingLesson, now = new Date()): boolean {
  return new Date(lesson.endsAt).getTime() <= now.getTime();
}
