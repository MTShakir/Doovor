'use server';

import { isProfileObjectPath } from '@repo/core/images';
import { err, ok, type Result } from '@repo/core/result';
import { instructorProfileSchema } from '@repo/core/schemas/profile';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { expireInstructorProfile } from '@/lib/public/instructor-profile';
import { avatarsBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  expireInstructorProfile(profileId);
  return ok(null);
}
