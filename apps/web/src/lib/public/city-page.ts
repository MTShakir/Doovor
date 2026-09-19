import 'server-only';
import { qualificationSchema } from '@repo/core/schemas/onboarding';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from '@repo/core/zod';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';
import { profileTags } from './instructor-profile';

const cityPageSchema = z.object({
  city: z.object({ slug: z.string(), name: z.string() }),
  area: z.object({ slug: z.string(), name: z.string() }).nullable(),
  transmission: z.string().nullable(),
  areas: z.array(z.object({ slug: z.string(), name: z.string(), instructorCount: z.number() })),
  automaticCount: z.number(),
  instructors: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      photoPath: z.string().nullable(),
      qualification: qualificationSchema,
      transmission: z.enum(['manual', 'automatic', 'both']),
      car: z.string().nullable(),
      areaName: z.string().nullable(),
      hourlyFromPence: z.number().nullable(),
    }),
  ),
});

export type CityPage = z.infer<typeof cityPageSchema>;

/**
 * A city, area or automatic page (PRD 8.3, M5-07): the instructors search may show whose base is
 * in the place. The same for every visitor, kept for hours, and read fresh whenever an instructor
 * changes what their profile shows, since that can change who is listed (D-114). Null for a place
 * that has no page.
 */
export async function cityPage(city: string, area: string | null, automatic: boolean): Promise<CityPage | null> {
  'use cache';
  cacheTag(profileTags.all, profileTags.places);

  const { data, error } = await getSupabaseAnonymousClient().rpc('city_page', {
    p_city: city,
    ...(area === null ? {} : { p_area: area }),
    ...(automatic ? { p_transmission: 'automatic' } : {}),
  });
  if (error) throw new Error(`Could not read the page for ${city}: ${error.message}`);
  if (data === null) {
    cacheLife('minutes');
    return null;
  }
  cacheLife('hours');
  return cityPageSchema.parse(data);
}
