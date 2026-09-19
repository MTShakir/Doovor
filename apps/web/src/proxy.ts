import { NextResponse, type NextRequest } from 'next/server';
import { rememberInvitation } from '@/lib/auth/invitation-proxy';
import { hostRedirect } from '@/lib/hosts';
import { refreshSession, withSessionCookies } from '@/lib/supabase/proxy';

/** Areas that need a signed-in person. Roles and TOTP are checked in each layout. */
const PROTECTED_PREFIXES = ['/app', '/admin', '/account', '/mfa', '/verify-phone', '/onboarding', '/suspended'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs before every page and Server Action request: attaches a request ID, refreshes the
 * Supabase session and turns signed-out visitors away from protected areas. Every Server
 * Action and Route Handler still checks the session itself (Next.js proxy docs).
 */
export async function proxy(request: NextRequest) {
  // The public site and the app are two hosts (D-084): a request on the wrong one moves first.
  const elsewhere = hostRedirect(request.headers.get('host'), request.nextUrl.pathname, request.nextUrl.search);
  if (elsewhere) return NextResponse.redirect(elsewhere.url, elsewhere.permanent ? 308 : 307);

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search);

  const { response, userId } = await refreshSession(request, requestHeaders);

  if (!userId && isProtected(request.nextUrl.pathname)) {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    const redirect = withSessionCookies(response, NextResponse.redirect(signIn));
    redirect.headers.set('x-request-id', requestId);
    return redirect;
  }

  // An invitation link opened by someone who has no account yet is kept until they have one
  // (AUTH-07). Signed in, there is nothing to remember: the page asks them there and then.
  if (!userId) rememberInvitation(response, request.nextUrl.pathname);

  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    // The service worker, the page it keeps for no connection, the webhooks and the error reports
    // passed on to Sentry (D-157) are fetched by machines, or need no session at all.
    '/((?!_next/static|_next/image|api/health|api/inngest|api/webhooks|api/reports|favicon.ico|sw.js|serwist/|offline$|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
