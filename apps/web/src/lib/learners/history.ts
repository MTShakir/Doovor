import 'server-only';
import { learnerEventLine } from '@repo/core/learners';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerHistoryEntry {
  at: string;
  line: string;
}

/** What has happened to one learner here (LRN-06), in sentences rather than codes. */
export async function learnerHistory(learnerId: string): Promise<LearnerHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_history', { p_learner_id: learnerId });
  if (error) throw error;

  return data
    .map((entry) => ({
      at: entry.happened_at,
      line: learnerEventLine({
        action: entry.action,
        before: entry.before as Record<string, unknown> | null,
        after: entry.after as Record<string, unknown> | null,
        actorName: entry.actor_name,
      }),
    }))
    .filter((entry): entry is LearnerHistoryEntry => entry.line !== null);
}
