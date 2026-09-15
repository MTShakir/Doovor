import 'server-only';
import { qualificationSchema } from '@repo/core/schemas/onboarding';
import { cacheLife, cacheTag, updateTag } from 'next/cache';
import { z } from 'zod';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';

/**
 * Cache tags for the public profile (M5-02). Whatever changes what a profile shows expires its
 * tag, so the next visitor reads it fresh; the times free are kept for a minute or so anyway.
 */
export const profileTags = {
  /** Every profile, for a change to who has one at all or to a whole Business's rules. */
  all: 'instructor-profiles',
  /** Everything on one instructor's profile. */
  instructor: (instructorId: string) => `instructor-profile:${instructorId}`,
  /** A profile looked up by its address, including one that is not there (yet). */
  slug: (slug: string) => `instructor-slug:${slug}`,
};

const lessonSchema = z.object({
  lessonTypeId: z.string(),
  name: z.string(),
  durationMinutes: z.number(),
  pricePence: z.number(),
});

const profileSchema = z.object({
  instructorId: z.string(),
  slug: z.string(),
  name: z.string(),
  photoPath: z.string().nullable(),
  bio: z.string().nullable(),
  languages: z.array(z.string()),
  yearsTeaching: z.number().nullable(),
  qualification: qualificationSchema,
  transmission: z.enum(['manual', 'automatic', 'both']),
  car: z.string().nullable(),
  dualControls: z.boolean(),
  specialisms: z.array(z.string()),
  radiusMiles: z.number(),
  outcode: z.string().nullable(),
  areaCentre: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  alsoCovers: z.array(z.string()),
  place: z
    .object({
      citySlug: z.string(),
      cityName: z.string(),
      areaSlug: z.string().nullable(),
      areaName: z.string().nullable(),
      hasHub: z.boolean(),
    })
    .nullable(),
  listed: z.boolean(),
  takingBookings: z.boolean(),
  instantBook: z.boolean(),
  business: z.object({ name: z.string(), type: z.enum(['independent', 'school']), slug: z.string() }),
  lessons: z.array(lessonSchema),
  packages: z.array(
    z.object({ name: z.string(), minutes: z.number(), pricePence: z.number(), expiryDays: z.number().nullable() }),
  ),
});

export type InstructorProfilePage = z.infer<typeof profileSchema>;

/**
 * An instructor's public profile by its address (PUB-01), the same for every visitor, so it is
 * kept for hours and expired by tag when the instructor changes it. Null when there is no such
 * profile, kept for minutes, so an instructor approved a moment ago appears soon even if nothing
 * expires the tag. A failed read throws rather than passing for a missing profile.
 */
export async function instructorProfile(slug: string): Promise<InstructorProfilePage | null> {
  'use cache';
  cacheTag(profileTags.all, profileTags.slug(slug));

  const { data, error } = await getSupabaseAnonymousClient().rpc('instructor_profile_page', { p_slug: slug });
  if (error) throw new Error(`Could not read the profile for ${slug}: ${error.message}`);
  if (data === null) {
    cacheLife('minutes');
    return null;
  }

  const profile = profileSchema.parse(data);
  cacheLife('hours');
  cacheTag(profileTags.instructor(profile.instructorId));
  return profile;
}

/**
 * The next few times a learner could book with an instructor, soonest first (PUB-01, R-04). Kept
 * for about a minute: the booking page checks a time again before anything is booked.
 */
export async function nextOpenTimes(instructorId: string, durationMinutes: number): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag(profileTags.all, profileTags.instructor(instructorId));

  const { data, error } = await getSupabaseAnonymousClient().rpc('next_open_slots', {
    p_instructor_id: instructorId,
    p_duration_minutes: durationMinutes,
    p_limit: 3,
  });
  if (error) throw new Error(`Could not read the free times for ${instructorId}: ${error.message}`);
  // Postgres writes an offset rather than a Z, and every other instant in the app is a Z.
  return data.map((one) => new Date(one).toISOString());
}

/** After a change to what one instructor's profile shows: the next visitor reads it fresh. Server Actions only. */
export function expireInstructorProfile(instructorId: string): void {
  updateTag(profileTags.instructor(instructorId));
}

/**
 * After a change to who has a profile at all, such as a verification decision, or to rules a
 * whole Business shares. Rare, so every profile is read fresh. Server Actions only.
 */
export function expireAllInstructorProfiles(): void {
  updateTag(profileTags.all);
}
