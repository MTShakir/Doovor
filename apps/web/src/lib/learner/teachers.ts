import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface MyInstructor {
  instructorId: string;
  name: string;
  /** Their booking link in the app, while their Business is open to book with. */
  bookingPath: string | null;
}

export interface MyTeachers {
  /** Who teaches them, at each Business they have not left. */
  instructors: MyInstructor[];
  /** Whether they learn with any Business at all, including a school still choosing who teaches them. */
  atABusiness: boolean;
}

/**
 * Who teaches the learner, and where to book them in the app (BOK-02, D-395). Row-level security
 * answers for them: their own relationships, and the profiles of the Businesses they are with.
 */
export async function myTeachers(userId: string): Promise<MyTeachers> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('learner_relationships')
    .select('instructor_id, instructor_profiles(display_name, public_slug), businesses!learner_relationships_business_id_fkey(status)')
    .eq('learner_id', userId)
    .neq('status', 'left')
    .order('created_at');
  if (error) throw error;

  const instructors = data.flatMap((row) => {
    const profile = row.instructor_profiles;
    if (row.instructor_id === null || profile === null) return [];
    const open = row.businesses.status === 'active' && profile.public_slug !== null;
    return [{ instructorId: row.instructor_id, name: profile.display_name, bookingPath: open ? `/book/${profile.public_slug}` : null }];
  });
  return { instructors, atABusiness: data.length > 0 };
}
