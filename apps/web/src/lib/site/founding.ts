import 'server-only';
import { foundingProgress, type FoundingProgress } from '@repo/core/founding';
import { z } from '@repo/core/zod';
import { cacheLife, cacheTag } from 'next/cache';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';

const placesSchema = z.object({
  months: z.number().int(),
  instructorLimit: z.number().int(),
  instructorsJoined: z.number().int(),
  schoolLimit: z.number().int(),
  schoolsJoined: z.number().int(),
});

export interface FoundingPlaces {
  months: number;
  instructors: FoundingProgress;
  schools: FoundingProgress;
}

/**
 * How many founding places have gone (D-203, D-243), for the public site.
 *
 * Kept for minutes, so the home page stays a page that is built once and served to everybody, and
 * still moves soon after somebody joins. A count nobody can read leaves the counter off the page
 * rather than the page, and a made-up number in its place is the one thing this must never show,
 * so a failed read is null and the band says what it said before there was a counter.
 */
export async function foundingPlaces(): Promise<FoundingPlaces | null> {
  'use cache';
  cacheTag('founding-places');
  cacheLife('minutes');

  const { data, error } = await getSupabaseAnonymousClient().rpc('founding_places');
  if (error) {
    console.error(`Could not read the founding places: ${error.message}`);
    return null;
  }
  const parsed = placesSchema.safeParse(data);
  if (!parsed.success) return null;

  const read = parsed.data;
  return {
    months: read.months,
    instructors: foundingProgress({ limit: read.instructorLimit, taken: read.instructorsJoined }),
    schools: foundingProgress({ limit: read.schoolLimit, taken: read.schoolsJoined }),
  };
}
