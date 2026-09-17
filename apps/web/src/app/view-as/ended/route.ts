import { NextResponse, type NextRequest } from 'next/server';
import { VIEW_AS_COOKIE } from '@/lib/auth/view-as';

/**
 * A viewing this browser named has ended, by itself after 30 minutes or from elsewhere (ADM-06,
 * D-129): the browser forgets it, and the staff member goes back to the admin portal as themselves.
 */
export function GET(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/admin', request.url));
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
