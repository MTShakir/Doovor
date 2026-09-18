import 'server-only';
import type { SitemapEntries } from '@repo/core/sitemap';
import { cacheLife, cacheTag } from 'next/cache';
import { z } from '@repo/core/zod';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';
import { profileTags } from './instructor-profile';

const profileEntry = z.object({ slug: z.string(), citySlug: z.string().nullable() });

const entriesSchema = z.object({
  instructors: z.array(profileEntry),
  schools: z.array(profileEntry),
  places: z.array(z.object({ citySlug: z.string(), areaSlug: z.string().nullable(), automatic: z.boolean(), instructorCount: z.number() })),
});

/**
 * What the sitemaps list (PRD 14.6, M5-08), the same for everybody. Kept for hours, and read fresh
 * with the place pages, whenever an instructor changes what their profile shows (D-114).
 */
export async function sitemapEntries(): Promise<SitemapEntries> {
  'use cache';
  cacheTag(profileTags.all, profileTags.places);
  cacheLife('hours');

  const { data, error } = await getSupabaseAnonymousClient().rpc('sitemap_entries');
  if (error) throw new Error(`Could not read what the sitemaps list: ${error.message}`);
  return entriesSchema.parse(data);
}

/** A sitemap as search engines fetch it. */
export function xmlResponse(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
