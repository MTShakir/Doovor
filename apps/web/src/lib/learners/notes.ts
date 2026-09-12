import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

/**
 * The notes kept about one learner (LRN-04). No learner can read this table at all, so
 * there is nothing here to keep from them: the policies do it, not this function.
 */
export async function learnerNotes(learnerId: string): Promise<LearnerNote[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('learner_notes')
    .select('id, body, author_id, created_at, author:users!learner_notes_author_id_fkey(full_name)')
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return data.map((note) => ({
    id: note.id,
    body: note.body,
    authorId: note.author_id,
    authorName: note.author.full_name === '' ? 'Someone here' : note.author.full_name,
    createdAt: note.created_at,
  }));
}
