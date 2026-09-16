import { isPlaceSlug } from '@repo/core/places';
import { schoolProfile } from '@/lib/public/school-profile';
import { schoolCard } from '@/lib/public/share-cards';
import { shareImageResponse } from '@/lib/public/share-image';

/** The image a shared school page shows (PRD 14.6, M5-08). Nothing for a school that is not there. */
export async function GET(_request: Request, { params }: RouteContext<'/schools/[city]/[slug]/share.png'>): Promise<Response> {
  const { slug } = await params;
  const school = isPlaceSlug(slug) ? await schoolProfile(slug) : null;
  if (!school) return new Response(null, { status: 404 });
  return shareImageResponse(schoolCard(school));
}
