import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerHealth {
  hasDisability: boolean;
  details: string | null;
  /** When they last told us, which is when they agreed to us holding it. */
  toldAt: string;
}

/**
 * What a learner told us about a disability (LRN-02, D-180). Null when they have not answered.
 *
 * The policies decide who reads it: the learner themselves, and whoever may see their card. This
 * is used for both, so an instructor's screen asks the same way a learner's does.
 */
export async function learnerHealth(learnerId: string): Promise<LearnerHealth | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('learner_health')
    .select('has_disability, details, told_at')
    .eq('user_id', learnerId)
    .maybeSingle();
  if (!data) return null;
  return { hasDisability: data.has_disability, details: data.details, toldAt: data.told_at };
}
