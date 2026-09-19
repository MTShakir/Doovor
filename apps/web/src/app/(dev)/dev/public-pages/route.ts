import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { profileTags } from '@/lib/public/instructor-profile';
import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Has every kept public page read fresh, for an end to end test that changed the database
 * directly: a badge run out, or an instructor made for one test (M5-07). The app itself expires
 * these pages from the actions that change them. Not reachable in production.
 */
export function POST(): NextResponse {
  if (!devRoutesOpen()) return new NextResponse('Not found', { status: 404 });
  revalidateTag(profileTags.all, { expire: 0 });
  return NextResponse.json({ expired: true });
}
