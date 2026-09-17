import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import { shareImageResponse } from '@/lib/public/share-image';

/** The image a shared link to the site's own pages shows (PRD 14.6, M5-09). */
export function GET(): Promise<Response> {
  return shareImageResponse(siteShareCard(brand.tagline));
}
