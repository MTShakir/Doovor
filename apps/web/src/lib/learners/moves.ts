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

const askedSchema = z.array(
  z.object({
    moveId: z.string(),
    learnerName: z.string(),
    status: z.enum(['asked', 'moved', 'stayed']),
    fromName: z.string(),
    toName: z.string(),
    /** Whether they have ever signed in, and so can answer for themselves (D-068). */
    canAnswer: z.boolean(),
  }),
);

/** One learner an instructor's joining asked to move with them, and how they answered (D-322). */
export type MoveAsked = z.infer<typeof askedSchema>[number];

/**
 * The learners the signed-in instructor's own Business asked to move to the school they teach
 * under now, those still to answer first (M9-23, D-322).
 */
export async function movesAsked(): Promise<MoveAsked[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('my_learners_asked_to_move');
  if (error) throw new Error(`Could not read the learners asked to move: ${error.message}`);
  return askedSchema.parse(data);
}

/** What the signed-in learner is asked to choose, oldest first. */
export async function learnerMoves(): Promise<LearnerMove[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_moves_for_me');
  if (error) return [];
  const parsed = movesSchema.safeParse(data);
  return parsed.success ? parsed.data : [];
}
