import { isPlaceSlug } from '@repo/core/places';
import { instructorProfile, movedProfile } from '@/lib/public/instructor-profile';
import { instructorCard } from '@/lib/public/share-cards';
import { shareImageResponse } from '@/lib/public/share-image';

/** The image a shared profile link shows (PRD 14.6, M5-08). Nothing for a profile that is not there. */
export async function GET(_request: Request, { params }: RouteContext<'/instructors/[city]/[slug]/share.png'>): Promise<Response> {
  const { slug } = await params;
  // An address from before its Business was renamed still draws the profile it leads to (D-269).
  const profile = isPlaceSlug(slug) ? ((await instructorProfile(slug)) ?? (await movedProfile(slug))) : null;
  if (!profile) return new Response(null, { status: 404 });
  return shareImageResponse(instructorCard(profile));
}
