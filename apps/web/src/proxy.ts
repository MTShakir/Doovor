import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession, withSessionCookies } from '@/lib/supabase/proxy';

/** Areas that need a signed-in person. Roles and TOTP are checked in each layout. */
const PROTECTED_PREFIXES = ['/app', '/admin', '/account', '/mfa', '/verify-phone', '/onboarding'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs before every page and Server Action request: attaches a request ID, refreshes the
 * Supabase session and turns signed-out visitors away from protected areas. Every Server
 * Action and Route Handler still checks the session itself (Next.js proxy docs).
 */
export async function proxy(request: NextRequest) {
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

  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/health|api/inngest|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
