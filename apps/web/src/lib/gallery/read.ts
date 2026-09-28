import 'server-only';
import { cache } from 'react';
import { getSupabaseAnonymousClient } from '@/lib/supabase/anonymous';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface GalleryPhoto {
  id: string;
  learnerName: string;
  /** The calendar day they passed, as "YYYY-MM-DD". */
  passedOn: string;
  imagePath: string;
  verified: boolean;
}

export interface PublicGallery {
  businessName: string;
  /** The Business own colour, for the banner. Null is the default black (D-210). */
  colour: string | null;
  photos: GalleryPhoto[];
}

/**
 * The wall on a public profile (D-218). Null where there is nothing to show: no such profile, or
 * a plan that does not carry it, which the database decides rather than this.
 */
export const instructorGallery = cache(async (slug: string): Promise<PublicGallery | null> => {
  const { data, error } = await getSupabaseAnonymousClient().rpc('instructor_gallery', { p_slug: slug });
  if (error) throw error;
  return (data as PublicGallery | null) ?? null;
});

export const schoolGallery = cache(async (slug: string): Promise<PublicGallery | null> => {
  const { data, error } = await getSupabaseAnonymousClient().rpc('school_gallery', { p_slug: slug });
  if (error) throw error;
  return (data as PublicGallery | null) ?? null;
});

export interface OwnGalleryPhoto extends GalleryPhoto {
  /** Taken down by us. Only the Business sees these, so they know what happened to one. */
  hidden: boolean;
}

/**
 * The Business own wall, as its instructor sees it: the ones staff have taken down included, so
 * a photo that disappeared from the public page is accounted for rather than a mystery.
 */
export async function myGallery(): Promise<OwnGalleryPhoto[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('id, learner_name, passed_on, image_path, verified_at, hidden_at')
    .order('passed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    learnerName: row.learner_name,
    passedOn: row.passed_on,
    imagePath: row.image_path,
    verified: row.verified_at !== null,
    hidden: row.hidden_at !== null,
  }));
}
