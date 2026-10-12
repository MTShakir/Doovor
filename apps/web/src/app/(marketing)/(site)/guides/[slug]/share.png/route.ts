import { guideBySlug, guideCard } from '@repo/core/guides';
import { shareImageResponse } from '@/lib/public/share-image';

/** The image a shared link to a guide shows (PRD 14.6, D-255): who it is for, its title and how long it takes. */
export async function GET(_request: Request, { params }: RouteContext<'/guides/[slug]/share.png'>): Promise<Response> {
  const guide = guideBySlug((await params).slug);
  if (guide === undefined) return new Response(null, { status: 404 });
  return shareImageResponse(guideCard(guide));
}
