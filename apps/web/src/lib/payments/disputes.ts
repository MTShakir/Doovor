import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** A learner's dispute of a no-show, for the learner card (R-09, M3-19). */
export interface NoShowDispute {
  id: string;
  bookingId: string;
  lessonAt: string;
  reason: string;
  createdAt: string;
  outcome: 'waived' | 'kept' | null;
  note: string | null;
}

/**
 * The disputes a learner has raised with a Business, newest first. Row-level security decides who
 * reads them: the people who run the Business, and the instructor whose lesson each was.
 */
export async function noShowDisputes(businessId: string, learnerId: string): Promise<NoShowDispute[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('no_show_disputes')
    .select('id, booking_id, reason, created_at, outcome, note, bookings(starts_at)')
    .eq('business_id', businessId)
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return [];

  return data.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    lessonAt: row.bookings.starts_at,
    reason: row.reason,
    createdAt: row.created_at,
    outcome: row.outcome,
    note: row.note,
  }));
}
