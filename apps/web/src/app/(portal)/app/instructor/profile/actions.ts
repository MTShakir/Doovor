'use server';

import { parsePostgresError } from '@repo/core/errors';
import { isProfileObjectPath } from '@repo/core/images';
import { err, ok, type Result } from '@repo/core/result';
import { onboardingBadgeSchema } from '@repo/core/schemas/onboarding';
import { instructorProfileSchema } from '@repo/core/schemas/profile';
import { todayInZone } from '@repo/core/time';
import { canSendBadge } from '@repo/core/badge-expiry';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles, expireInstructorProfile } from '@/lib/public/instructor-profile';
import { avatarsBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { vouchingSchool } from '@/lib/school/link';
import { submitBadge } from '@/lib/verification/submit-badge';

/** INS-01: the profile a learner reads. Badge and verification are not editable here. */
export async function saveProfile(input: unknown, photoPath?: string | null): Promise<Result<null>> {
  const parsed = instructorProfileSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return err('NOT_ALLOWED');
  const profileId = membership.instructorProfileId;

  if (typeof photoPath === 'string' && !isProfileObjectPath(photoPath, profileId)) {
    return err('NOT_ALLOWED', 'That photo could not be saved. Try choosing it again.');
  }

  const supabase = await createSupabaseServerClient();
  // What they trade as, for somebody who owns their own business (D-196). The database checks
  // the role again; at a school the field is never rendered and is ignored if it turns up.
  if (
    parsed.data.businessName !== undefined &&
    membership.businessType === 'independent' &&
    membership.role === 'owner'
  ) {
    const named = await supabase.rpc('set_business_name', {
      p_business_id: membership.businessId,
      p_name: parsed.data.businessName,
    });
    if (named.error) return err(parsePostgresError(named.error).code, 'We could not save your business name. Try again.');
  }

  const { data: current } = await supabase
    .from('instructor_profiles')
    .select('photo_path')
    .eq('id', profileId)
    .maybeSingle();

  const values = parsed.data;
  const { error } = await supabase
    .from('instructor_profiles')
    .update({
      display_name: values.displayName,
      bio: values.bio === '' ? null : values.bio,
      languages: values.languages,
      years_teaching: values.yearsTeaching,
      transmission: values.transmission,
      car_make: values.carMake === '' ? null : values.carMake,
      car_model: values.carModel === '' ? null : values.carModel,
      dual_controls: values.dualControls,
      specialisms: values.specialisms,
      ...(photoPath === undefined ? {} : { photo_path: photoPath }),
    })
    .eq('id', profileId);
  if (error) return err('UNKNOWN', 'We could not save your profile. Try again.');

  // The picture it replaced is nobody's now.
  if (photoPath !== undefined && current?.photo_path && current.photo_path !== photoPath) {
    await removeProfileImage(supabase, avatarsBucket, current.photo_path);
  }

  revalidatePath('/app/instructor/profile');
  // A new Business name is a new address for the profile (D-269): the old one has to stop
  // answering, and the new one, which may have been looked up and found empty, start.
  if (parsed.data.businessName !== undefined && membership.businessType === 'independent') expireAllInstructorProfiles();
  else expireInstructorProfile(profileId);
  return ok(null);
}

/**
 * PUB-04: show the profile in search, or hide it there while the booking link keeps working. The
 * instructor's own choice; an expired badge keeps the profile out of search by itself (D-113).
 */
export async function saveListing(listed: unknown): Promise<Result<null>> {
  const parsed = z.boolean().safeParse(listed);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return err('NOT_ALLOWED');
  const profileId = membership.instructorProfileId;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('instructor_profiles').update({ is_listed: parsed.data }).eq('id', profileId);
  if (error) return err('UNKNOWN', 'We could not change that. Try again.');

  revalidatePath('/app/instructor/profile');
  expireInstructorProfile(profileId);
  return ok(null);
}

/**
 * Sends a badge from the profile to be checked, with its photo (INS-02, D-262). A school's instructor
 * keeps its details up to date instead, whenever they like, with nothing to check (D-280).
 */
export async function resubmitBadge(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = onboardingBadgeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return err('NOT_ALLOWED');
  const profileId = membership.instructorProfileId;
  const vouched = (await vouchingSchool(membership)) !== null;

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from('instructor_profiles')
    .select('verification_status, badge_expiry, badge_path')
    .eq('id', profileId)
    .maybeSingle();
  if (!current || (!vouched && !canSendBadge(current.verification_status, current.badge_expiry, todayInZone()))) {
    return err('NOT_ALLOWED', 'Your badge is already checked or being checked.');
  }

  const sent = await submitBadge(supabase, profileId, parsed.data, current.badge_path, { vouched });
  if (sent.ok) revalidatePath('/app/instructor/profile');
  return sent;
}

