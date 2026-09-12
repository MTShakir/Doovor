'use server';

import { normaliseOutcode } from '@repo/core/postcode';
import { err, ok, type Result } from '@repo/core/result';
import { onboardingAreaSchema } from '@repo/core/schemas/onboarding';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { getGeoProvider } from '@/lib/geo/provider';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const districtSchema = z.object({
  outcode: z
    .string()
    .trim()
    .transform((value, context) => {
      const outcode = normaliseOutcode(value);
      if (outcode === null) {
        context.addIssue({ code: 'custom', message: 'Enter a district like LS17' });
        return z.NEVER;
      }
      return outcode;
    }),
  rule: z.enum(['include', 'exclude']),
});

async function instructor(): Promise<{ profileId: string; businessId: string } | null> {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  return membership?.instructorProfileId
    ? { profileId: membership.instructorProfileId, businessId: membership.businessId }
    : null;
}

/**
 * COV-01: where lessons start from and how far they go, changed after onboarding. As in
 * onboarding, the browser sends a postcode and the server looks the place up itself.
 */
export async function saveCoverage(input: unknown): Promise<Result<null>> {
  const parsed = onboardingAreaSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const who = await instructor();
  if (!who) return err('NOT_ALLOWED');

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
      base_location: `SRID=4326;POINT(${String(found.place.longitude)} ${String(found.place.latitude)})`,
      radius_miles: parsed.data.radiusMiles,
    })
    .eq('id', who.profileId);
  if (error) return err('UNKNOWN', 'We could not save your area. Try again.');

  revalidatePath('/app/instructor/profile');
  return ok(null);
}

/** COV-02: a district the circle misses, or one inside it they will not take. */
export async function addDistrict(input: unknown): Promise<Result<null>> {
  const parsed = districtSchema.safeParse(input);
  if (!parsed.success) {
    return err('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Enter a district like LS17');
  }

  const who = await instructor();
  if (!who) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('coverage_districts').insert({
    instructor_id: who.profileId,
    business_id: who.businessId,
    outcode: parsed.data.outcode,
    rule: parsed.data.rule,
  });
  // The same district cannot be both added and left out: the newer answer replaces the older.
  if (error?.code === '23505') {
    const { error: replaced } = await supabase
      .from('coverage_districts')
      .update({ rule: parsed.data.rule })
      .eq('instructor_id', who.profileId)
      .eq('outcode', parsed.data.outcode);
    if (replaced) return err('UNKNOWN', 'We could not save that district. Try again.');
  } else if (error) {
    return err('UNKNOWN', 'We could not save that district. Try again.');
  }

  revalidatePath('/app/instructor/profile');
  return ok(null);
}

export async function removeDistrict(outcode: unknown): Promise<Result<null>> {
  const parsed = z.string().safeParse(outcode);
  const tidy = parsed.success ? normaliseOutcode(parsed.data) : null;
  if (tidy === null) return err('VALIDATION_FAILED', 'Enter a district like LS17');

  const who = await instructor();
  if (!who) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('coverage_districts')
    .delete()
    .eq('instructor_id', who.profileId)
    .eq('outcode', tidy);
  if (error) return err('UNKNOWN', 'We could not remove that district. Try again.');

  revalidatePath('/app/instructor/profile');
  return ok(null);
}
