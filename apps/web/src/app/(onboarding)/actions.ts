'use server';

import { err, type Result } from '@repo/core/result';
import { onboardingNameSchema } from '@repo/core/schemas/onboarding';
import { requireOnboarding } from '@/lib/onboarding/session';
import { nextStep, slugForStep } from '@/lib/onboarding/steps';
import { fieldErrors } from '@/lib/forms';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Moves to the next step, or finishes onboarding after the last one (AUTH-04). */
async function advance(profileId: string, from: number): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const next = nextStep(from);
  const patch: { onboarding_step?: number; onboarding_completed_at?: string } = next
    ? { onboarding_step: next.step }
    : { onboarding_completed_at: new Date().toISOString() };
  const { error } = await supabase.from('instructor_profiles').update(patch).eq('id', profileId);
  if (error) throw new Error(`Could not save your progress: ${error.message}`);
  redirectTo(next ? `/onboarding/${slugForStep(next.step)}` : '/app/instructor');
}

/** AUTH-04 step 1: the name learners see. Success redirects to the next step. */
export async function saveName(input: unknown): Promise<Result<null>> {
  const parsed = onboardingNameSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('instructor_profiles')
    .update({ display_name: parsed.data.fullName })
    .eq('id', session.profileId);
  if (error) return err('UNKNOWN', 'We could not save your name. Try again.');

  // Saving succeeded, so this redirects and never resolves.
  return advance(session.profileId, session.step);
}

/** Continue without filling this step in. Every step but the name can be skipped (AUTH-04). */
export async function continueFromStep(): Promise<never> {
  const session = await requireOnboarding();
  return advance(session.profileId, session.step);
}
