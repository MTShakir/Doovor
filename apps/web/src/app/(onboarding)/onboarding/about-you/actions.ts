'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, type Result } from '@repo/core/result';
import { learnerOnboardingSchema } from '@repo/core/schemas/learner';
import { fieldErrors } from '@/lib/forms';
import { getAccess } from '@/lib/auth/session';
import { getGeoProvider } from '@/lib/geo/provider';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AUTH-06: the five things a learner is asked once. The date of birth goes to the private
 * table, which only they can read, and the database keeps the age rule as well (R-16, M2-01).
 */
export async function saveLearnerProfile(input: unknown): Promise<Result<null>> {
  const parsed = learnerOnboardingSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const access = await getAccess();
  if (!access?.access.isLearner) return err('NOT_ALLOWED');
  const userId = access.access.userId;

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
  const { error: named } = await supabase.from('users').update({ full_name: parsed.data.fullName }).eq('id', userId);
  if (named) return err('UNKNOWN', 'We could not save your details. Try again.');

  // Insert or update, never upsert: the column grants deliberately exclude `user_id` from
  // updates, and an upsert would try to write it either way.
  const { count } = await supabase
    .from('learner_private')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const dateOfBirth = { date_of_birth: parsed.data.dateOfBirth };
  const { error: dated } =
    count === 0
      ? await supabase.from('learner_private').insert({ user_id: userId, ...dateOfBirth })
      : await supabase.from('learner_private').update(dateOfBirth).eq('user_id', userId);
  if (dated) {
    const { code } = parsePostgresError(dated);
    if (code === 'VALIDATION_FAILED') {
      return err('VALIDATION_FAILED', undefined, { dateOfBirth: 'You have to be 16 to start learning to drive' });
    }
    return err('UNKNOWN', 'We could not save your details. Try again.');
  }

  const answers = {
    postcode: found.place.postcode,
    // Well known text, which is how PostGIS takes a point over the API.
    location: `SRID=4326;POINT(${String(found.place.longitude)} ${String(found.place.latitude)})`,
    transmission: parsed.data.transmission,
    experience_level: parsed.data.experienceLevel,
  };
  // The row is created at sign-up, so this is normally an update.
  const { error, count: updated } = await supabase
    .from('learner_profiles')
    .update(answers, { count: 'exact' })
    .eq('user_id', userId);
  if (error) return err('UNKNOWN', 'We could not save your details. Try again.');
  if (updated === 0) {
    const { error: created } = await supabase.from('learner_profiles').insert({ user_id: userId, ...answers });
    if (created) return err('UNKNOWN', 'We could not save your details. Try again.');
  }

  // Saving succeeded, so this redirects and never resolves.
  return redirectTo('/app/learner');
}
