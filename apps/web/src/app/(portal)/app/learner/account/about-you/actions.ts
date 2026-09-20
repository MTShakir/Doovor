'use server';

import { err, ok, type Result } from '@repo/core/result';
import { learnerHealthSchema } from '@repo/core/schemas/learner';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * What a learner tells us about a disability (LRN-02, D-180). Theirs to write, theirs to change:
 * the policies let nobody else touch the row.
 */
export async function saveMyHealth(input: unknown): Promise<Result<null>> {
  const parsed = learnerHealthSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const answer = {
    has_disability: parsed.data.hasDisability === 'yes',
    // A no keeps nothing: what they wrote before goes when the answer changes.
    details: parsed.data.hasDisability === 'yes' ? (parsed.data.details ?? null) : null,
    told_at: new Date().toISOString(),
  };

  const { count } = await supabase
    .from('learner_health')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', session.userId);
  const { error } =
    count === 0
      ? await supabase.from('learner_health').insert({ user_id: session.userId, ...answer })
      : await supabase.from('learner_health').update(answer).eq('user_id', session.userId);
  if (error) return err('UNKNOWN', 'We could not save that. Try again.');

  revalidatePath('/app/learner/account/about-you');
  return ok(null);
}

/** Taking it back: the row goes, and their instructor sees nothing about it again (D-180). */
export async function removeMyHealth(): Promise<Result<null>> {
  const { session } = await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('learner_health').delete().eq('user_id', session.userId);
  if (error) return err('UNKNOWN', 'We could not take that off your record. Try again.');

  revalidatePath('/app/learner/account/about-you');
  return ok(null);
}
