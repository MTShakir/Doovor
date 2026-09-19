'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { isSkillCode, isSkillRating } from '@repo/core/skills';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ratingSchema = z.object({
  learnerId: z.uuid(),
  skillCode: z.string().refine(isSkillCode),
  rating: z.number().int().refine(isSkillRating),
});

/**
 * A skill set on the map by hand, from the learner's progress page (PRG-02, D-169). The database
 * decides who may: the instructor who teaches the learner, or the Business's owner or manager.
 */
export async function rateSkill(input: unknown): Promise<Result<null>> {
  const parsed = ratingSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('rate_skill', {
    p_learner_id: parsed.data.learnerId,
    p_skill_code: parsed.data.skillCode,
    p_rating: parsed.data.rating,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}/progress`);
  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}
