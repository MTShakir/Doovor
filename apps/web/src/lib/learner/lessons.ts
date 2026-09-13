import 'server-only';
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
}

/** The learner's own lessons (PRD 8.2). Row-level security answers for them, not this. */
export async function myLessons(): Promise<{ upcoming: MyLesson[]; past: MyLesson[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, payment_status, price_pence, instructor_id, instructor_profiles(display_name), lesson_types(name), pickup_points(label), businesses!bookings_business_id_fkey(stripe_charges_enabled)',
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
    instructorId: row.instructor_id,
    instructorName: row.instructor_profiles.display_name,
    lessonType: row.lesson_types.name,
    pricePence: row.price_pence,
    pickup: row.pickup_points?.label ?? null,
    durationMinutes: Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000),
    canPayNow: row.businesses.stripe_charges_enabled && ['unpaid', 'pending', 'failed'].includes(row.payment_status),
  }));

  return {
    upcoming: all
      .filter((lesson) => new Date(lesson.startsAt).getTime() >= now && !off.includes(lesson.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: all.filter((lesson) => new Date(lesson.startsAt).getTime() < now || off.includes(lesson.status)),
  };
}
