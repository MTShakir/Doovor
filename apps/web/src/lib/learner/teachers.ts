import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface MyInstructor {
  instructorId: string;
  name: string;
  /** Their booking link in the app, while their Business is open to book with. */
  bookingPath: string | null;
}

/**
 * Who teaches the learner, at each Business they have not left, and where to book them in the app
 * (BOK-02, D-395). Row-level security answers for them: their own relationships, and the profiles
 * of the Businesses they are with.
 */
export async function myInstructors(userId: string): Promise<MyInstructor[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('learner_relationships')
    .select('instructor_id, instructor_profiles(display_name, public_slug), businesses!learner_relationships_business_id_fkey(status)')
    .eq('learner_id', userId)
    .neq('status', 'left')
    .not('instructor_id', 'is', null)
    .order('created_at');
  if (error) throw error;

  return data.flatMap((row) => {
    const profile = row.instructor_profiles;
    if (profile === null) return [];
    const open = row.businesses.status === 'active' && profile.public_slug !== null;
    return [{ instructorId: row.instructor_id, name: profile.display_name, bookingPath: open ? `/book/${profile.public_slug}` : null }];
  });
}
