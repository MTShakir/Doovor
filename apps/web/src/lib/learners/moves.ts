import 'server-only';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const movesSchema = z.array(
  z.object({
    moveId: z.string(),
    reason: z.enum(['joined_school', 'left_school']),
    fromName: z.string(),
    toName: z.string(),
    instructorName: z.string().nullable(),
  }),
);

/** A choice the learner is asked to make: to move with their instructor, or back to a school (D-292). */
export type LearnerMove = z.infer<typeof movesSchema>[number];

/** What the signed-in learner is asked to choose, oldest first. */
export async function learnerMoves(): Promise<LearnerMove[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_moves_for_me');
  if (error) return [];
  const parsed = movesSchema.safeParse(data);
  return parsed.success ? parsed.data : [];
}
