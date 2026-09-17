'use server';

import { parsePostgresError } from '@repo/core/errors';
import { isProfileObjectPath } from '@repo/core/images';
import { err, type Result } from '@repo/core/result';
import {
  onboardingAreaSchema,
  onboardingBadgeSchema,
  onboardingHoursSchema,
  onboardingNameSchema,
  onboardingPricesSchema,
} from '@repo/core/schemas/onboarding';
import { getGeoProvider } from '@/lib/geo/provider';
import { requireOnboarding } from '@/lib/onboarding/session';
import { nextStep, slugForStep } from '@/lib/onboarding/steps';
import { fieldErrors } from '@/lib/forms';
import { redirectTo } from '@/lib/redirect-to';
import { avatarsBucket, badgesBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Moves to the next of their steps, or finishes onboarding after the last one (AUTH-04). */
async function advance(session: { profileId: string; step: number; businessType: 'independent' | 'school' }): Promise<never> {
  const { profileId, step: from, businessType } = session;
  const supabase = await createSupabaseServerClient();
  const next = nextStep(from, businessType);
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
  return advance(session);
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
  return advance(session);
}

/**
 * AUTH-04 step 3, COV-01: where lessons start from, and how far out they go.
 *
 * The browser sends a postcode, never coordinates: the server looks the place up itself, so
 * nobody can put themselves somewhere they are not.
 */
export async function saveArea(input: unknown): Promise<Result<null>> {
  const parsed = onboardingAreaSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const geo = await getGeoProvider();
  const found = await geo.lookup(parsed.data.postcode);
  if (!found.ok) {
    if (found.reason === 'UNAVAILABLE') {
      return err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment.');
    }
    return err('VALIDATION_FAILED', undefined, {
      postcode:
        found.reason === 'NOT_FOUND'
          ? 'We could not find that postcode. Check it and try again'
          : 'Enter a UK postcode like LS1 4DY',
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('instructor_profiles')
    .update({
      base_postcode: found.place.postcode,
      // Well known text, which is how PostGIS takes a point over the API.
      base_location: `SRID=4326;POINT(${String(found.place.longitude)} ${String(found.place.latitude)})`,
      radius_miles: parsed.data.radiusMiles,
    })
    .eq('id', session.profileId);
  if (error) return err('UNKNOWN', 'We could not save your area. Try again.');

  // Saving succeeded, so this redirects and never resolves.
  return advance(session);
}

/** AUTH-04 step 4, R-05, PAY-04: one hourly price, and ten hours if they sell them that way. */
export async function savePrices(input: unknown): Promise<Result<null>> {
  const parsed = onboardingPricesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_onboarding_prices', {
    p_business_id: session.businessId,
    p_hourly_price_pence: parsed.data.hourlyPrice,
    p_package_price_pence: parsed.data.packagePrice ?? undefined,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    return err(code === 'UNKNOWN' ? 'UNKNOWN' : code);
  }

  // Saving succeeded, so this redirects and never resolves.
  return advance(session);
}

/** AUTH-04 step 5, DIA-01: the week they work. Local wall clock, never instants. */
export async function saveHours(input: unknown): Promise<Result<null>> {
  const parsed = onboardingHoursSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireOnboarding();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_working_hours', {
    p_instructor_id: session.profileId,
    p_weekdays: parsed.data.days,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    return err(code);
  }

  // Saving succeeded, so this redirects and never resolves.
  return advance(session);
}

/** Continue without filling this step in. Every step but the name can be skipped (AUTH-04). */
export async function continueFromStep(): Promise<never> {
  const session = await requireOnboarding();
  return advance(session);
}
