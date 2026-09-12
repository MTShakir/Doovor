'use server';

import { parsePostgresError } from '@repo/core/errors';
import { isProfileObjectPath } from '@repo/core/images';
import { err, type Result } from '@repo/core/result';
import { onboardingBadgeSchema, onboardingNameSchema } from '@repo/core/schemas/onboarding';
import { requireOnboarding } from '@/lib/onboarding/session';
import { nextStep, slugForStep } from '@/lib/onboarding/steps';
import { fieldErrors } from '@/lib/forms';
import { redirectTo } from '@/lib/redirect-to';
import { avatarsBucket, badgesBucket, removeProfileImage } from '@/lib/storage/images';
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

/** AUTH-04 step 1: the name learners see, and their photo. Success redirects to the next step. */
export async function saveName(input: unknown): Promise<Result<null>> {
  const parsed = onboardingNameSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const { fullName, photoPath } = parsed.data;
  // Storage refuses a folder that is not theirs, and so does this: the browser sends the path.
  if (typeof photoPath === 'string' && !isProfileObjectPath(photoPath, session.profileId)) {
    return err('NOT_ALLOWED', 'That photo could not be saved. Try choosing it again.');
  }

  const supabase = await createSupabaseServerClient();
  const patch =
    photoPath === undefined ? { display_name: fullName } : { display_name: fullName, photo_path: photoPath };
  const { error } = await supabase.from('instructor_profiles').update(patch).eq('id', session.profileId);
  if (error) return err('UNKNOWN', 'We could not save your name. Try again.');

  // The picture it replaced is nobody's now.
  if (photoPath !== undefined && session.photoPath && session.photoPath !== photoPath) {
    await removeProfileImage(supabase, avatarsBucket, session.photoPath);
  }

  // Saving succeeded, so this redirects and never resolves.
  return advance(session.profileId, session.step);
}

/** AUTH-04 step 2, INS-02: the badge goes to staff for review, never straight to a tick. */
export async function saveBadge(input: unknown): Promise<Result<null>> {
  const parsed = onboardingBadgeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const { qualification, badgeNumber, badgeExpiry, dbsConfirmed, badgePath } = parsed.data;
  if (typeof badgePath === 'string' && !isProfileObjectPath(badgePath, session.profileId)) {
    return err('NOT_ALLOWED', 'That photo could not be saved. Try choosing it again.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('submit_verification', {
    p_profile_id: session.profileId,
    p_qualification: qualification,
    p_badge_number: badgeNumber,
    p_badge_expiry: badgeExpiry,
    p_dbs_confirmed: dbsConfirmed,
    p_badge_path: badgePath ?? undefined,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    return err(code === 'VALIDATION_FAILED' ? 'VALIDATION_FAILED' : code);
  }

  // The badge photo it replaced is nobody's now.
  if (typeof badgePath === 'string' && session.badgePath && session.badgePath !== badgePath) {
    await removeProfileImage(supabase, badgesBucket, session.badgePath);
  }

  // Saving succeeded, so this redirects and never resolves.
  return advance(session.profileId, session.step);
}

/** Continue without filling this step in. Every step but the name can be skipped (AUTH-04). */
export async function continueFromStep(): Promise<never> {
  const session = await requireOnboarding();
  return advance(session.profileId, session.step);
}
