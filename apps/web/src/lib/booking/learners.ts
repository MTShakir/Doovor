import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookableLearner } from '@/app/(portal)/app/instructor/book-lesson';

/** The people an instructor can book a lesson for (BOK-01). */
export async function bookableLearners(instructorProfileId: string): Promise<BookableLearner[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('learner_list')
    .select('learner_id, full_name, usual_duration_minutes, status')
    .eq('instructor_id', instructorProfileId)
    .in('status', ['enquiry', 'waiting', 'active', 'test_booked'])
    .order('full_name')
    .limit(200);

  return (data ?? [])
    .filter((row): row is typeof row & { learner_id: string } => row.learner_id !== null)
    .map((row) => ({
      id: row.learner_id,
      name: row.full_name === null || row.full_name === '' ? 'Unnamed learner' : row.full_name,
      usualDurationMinutes: row.usual_duration_minutes,
    }));
}
