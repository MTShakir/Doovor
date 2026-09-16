import { isPlaceSlug } from '@repo/core/places';
import { cityPage } from '@/lib/public/city-page';
import { placeCard } from '@/lib/public/share-cards';
import { shareImageResponse } from '@/lib/public/share-image';
import type { PlaceParams } from './place';

/** The image a shared city, area or automatic page shows (PRD 14.6, M5-08). Nothing for a place with no page. */
export async function placeShareImage({ city, area, automatic }: PlaceParams): Promise<Response> {
  const valid = isPlaceSlug(city) && (area === null || isPlaceSlug(area));
  const page = valid ? await cityPage(city, area, automatic) : null;
  if (!page) return new Response(null, { status: 404 });
  return shareImageResponse(placeCard(page, automatic));
}
