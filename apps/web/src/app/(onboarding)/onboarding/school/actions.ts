'use server';

import { isBusinessObjectPath } from '@repo/core/images';
import { err, type Result } from '@repo/core/result';
import { instructorInviteSchema, schoolDetailsSchema } from '@repo/core/schemas/school';
import { fieldErrors } from '@/lib/forms';
import { getGeoProvider } from '@/lib/geo/provider';
import { requireSchoolSetup } from '@/lib/onboarding/school-session';
import { expireSchoolProfile } from '@/lib/public/school-profile';
import { createInstructorInvitation, type InstructorInvitation } from '@/lib/school/invitations';
import { redirectTo } from '@/lib/redirect-to';
import { avatarsBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AUTH-05: what the school is called, its logo, where it is and roughly how many instructors
 * teach there. The browser sends a postcode, never coordinates: the server looks it up itself.
 * Success redirects to inviting the instructors.
 */
export async function saveSchoolDetails(input: unknown): Promise<Result<null>> {
  const parsed = schoolDetailsSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireSchoolSetup('/onboarding/school');
  const { name, logoPath, postcode, expectedInstructors } = parsed.data;
  // Storage refuses a folder that is not the school's, and so does this: the browser sends the path.
  if (typeof logoPath === 'string' && !isBusinessObjectPath(logoPath, session.businessId)) {
    return err('NOT_ALLOWED', 'That logo could not be saved. Try choosing it again.');
  }

  const geo = await getGeoProvider();
  const found = await geo.lookup(postcode);
  if (!found.ok) {
    if (found.reason === 'UNAVAILABLE') {
      return err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment.');
    }
    return err('VALIDATION_FAILED', undefined, {
      postcode:
        found.reason === 'NOT_FOUND' ? 'We could not find that postcode. Check it and try again' : 'Enter a UK postcode like M1 1AE',
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('businesses')
    .update({
      name,
      base_postcode: found.place.postcode,
      // Well known text, which is how PostGIS takes a point over the API.
      base_location: `SRID=4326;POINT(${String(found.place.longitude)} ${String(found.place.latitude)})`,
      expected_instructors: expectedInstructors,
      ...(logoPath === undefined ? {} : { logo_url: logoPath }),
    })
    .eq('id', session.businessId);
  if (error) return err('UNKNOWN', 'We could not save your school. Try again.');

  // The logo it replaced is nobody's now.
  if (logoPath !== undefined && session.logoPath && session.logoPath !== logoPath) {
    await removeProfileImage(supabase, avatarsBucket, session.logoPath);
  }
  expireSchoolProfile(session.slug);

  // Saving succeeded, so this redirects and never resolves.
  return redirectTo('/onboarding/school/invite');
}

/** AUTH-05: one link for one instructor, sent from the owner's own phone by text, WhatsApp or email (D-118). */
export async function inviteInstructor(input: unknown): Promise<Result<InstructorInvitation>> {
  const parsed = instructorInviteSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const session = await requireSchoolSetup('/onboarding/school/invite');
  return createInstructorInvitation({ businessId: session.businessId, name: session.name }, parsed.data);
}

/** AUTH-05: the school is set up, and its portal opens. Inviting can carry on from there. */
export async function finishSchoolSetup(): Promise<Result<null>> {
  const session = await requireSchoolSetup('/onboarding/school/invite');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('businesses')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', session.businessId);
  if (error) return err('UNKNOWN', 'We could not finish setting up your school. Try again.');

  // Saved, so this redirects and never resolves.
  return redirectTo('/app/school');
}
