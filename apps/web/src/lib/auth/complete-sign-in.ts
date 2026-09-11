import 'server-only';
import { getAccessContext } from '@repo/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { availablePortals, landingPath, safeNextPath } from './portals';

/**
 * Every sign-in path ends here (password, magic link, Google, phone code). On the first
 * sign-in it finishes setting up the role chosen at sign-up (AUTH-03): the instructor's
 * Business of one, the school, or the learner profile. Returns where to go next.
 */
export async function completeSignIn(next?: string | null): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return '/sign-in';

  let access = await getAccessContext(supabase, user.id);

  if (availablePortals(access).length === 0) {
    const { data: profile } = await supabase.from('users').select('intended_role, full_name').eq('id', user.id).single();
    const metadata = user.user_metadata as Record<string, unknown>;
    const schoolName = typeof metadata.school_name === 'string' ? metadata.school_name.trim() : '';

    if (profile?.intended_role === 'learner') {
      await supabase.from('learner_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    } else if (profile?.intended_role === 'instructor') {
      await supabase.rpc('create_business', { p_type: 'independent', p_name: profile.full_name || 'My driving business' });
    } else if (profile?.intended_role === 'school' && schoolName) {
      await supabase.rpc('create_business', { p_type: 'school', p_name: schoolName });
    }
    access = await getAccessContext(supabase, user.id);
  }

  const destination = availablePortals(access).length > 0 ? safeNextPath(next, landingPath(access)) : '/start';

  // Instructors verify their mobile by text after sign-up (AUTH-02, PRD 10.1 step 2).
  const isInstructor = access.memberships.some((m) => m.instructorProfileId !== null);
  if (isInstructor && !user.phone_confirmed_at) {
    return `/verify-phone?next=${encodeURIComponent(destination)}`;
  }
  return destination;
}
