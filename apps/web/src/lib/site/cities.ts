import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from 'zod';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';

const citiesSchema = z.array(z.object({ slug: z.string(), name: z.string() }));

export type LaunchCity = z.infer<typeof citiesSchema>[number];

/**
 * The launch cities (D-108), for the links to their pages from every page of the site (PRD 14.6).
 * A city is only ever added by a migration, so the list is kept for days. The site's own pages
 * need nothing else from the database, so a failed read leaves the links out rather than the
 * page, and is tried again in minutes.
 */
export async function launchCities(): Promise<LaunchCity[]> {
  'use cache';
  cacheTag('launch-cities');

  const { data, error } = await getSupabaseAnonymousClient().from('cities').select('slug, name').order('name');
  if (error) {
    console.error(`Could not read the launch cities: ${error.message}`);
    cacheLife('minutes');
    return [];
  }
  cacheLife('days');
  return citiesSchema.parse(data);
}
