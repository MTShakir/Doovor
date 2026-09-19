import 'server-only';
import { qualificationSchema } from '@repo/core/schemas/onboarding';
import { cacheLife, cacheTag, updateTag } from 'next/cache';
import { z } from '@repo/core/zod';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';
import { profileTags } from './instructor-profile';

const schoolSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoPath: z.string().nullable(),
  outcode: z.string().nullable(),
  place: z
    .object({
      citySlug: z.string(),
      cityName: z.string(),
      areaSlug: z.string().nullable(),
      areaName: z.string().nullable(),
      hasHub: z.boolean(),
    })
    .nullable(),
  instructors: z.array(
    z.object({
      instructorId: z.string(),
      slug: z.string(),
      name: z.string(),
      photoPath: z.string().nullable(),
      qualification: qualificationSchema,
      transmission: z.enum(['manual', 'automatic', 'both']),
      car: z.string().nullable(),
      citySlug: z.string().nullable(),
      takingBookings: z.boolean(),
      hourlyFromPence: z.number().nullable(),
    }),
  ),
  lessons: z.array(z.object({ name: z.string(), durationMinutes: z.number(), pricePence: z.number() })),
  packages: z.array(
    z.object({ name: z.string(), minutes: z.number(), pricePence: z.number(), expiryDays: z.number().nullable() }),
  ),
});

export type SchoolProfilePage = z.infer<typeof schoolSchema>;

/** A school's profile looked up by its address, including one that is not there (yet). */
function schoolSlugTag(slug: string): string {
  return `school-slug:${slug}`;
}

/** After a school changes what its profile shows, such as its name or logo. Server Actions only. */
export function expireSchoolProfile(slug: string): void {
  updateTag(schoolSlugTag(slug));
}

/**
 * A school's public profile by its address (PUB-01, M5-03), the same for every visitor. Kept for
 * hours, and expired with any of its instructors' profiles, since it shows them; nothing found is
 * kept for minutes. A failed read throws rather than passing for a missing school.
 */
export async function schoolProfile(slug: string): Promise<SchoolProfilePage | null> {
  'use cache';
  cacheTag(profileTags.all, schoolSlugTag(slug));

  const { data, error } = await getSupabaseAnonymousClient().rpc('school_profile_page', { p_slug: slug });
  if (error) throw new Error(`Could not read the school profile for ${slug}: ${error.message}`);
  if (data === null) {
    cacheLife('minutes');
    return null;
  }

  const school = schoolSchema.parse(data);
  cacheLife('hours');
  for (const instructor of school.instructors) cacheTag(profileTags.instructor(instructor.instructorId));
  return school;
}
