import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs before every page and Server Action request. Attaches a request ID for structured
 * logs. Supabase session refresh and route protection join in M0-21. Authorisation never
 * relies on this file: every Server Action and Route Handler checks the session itself.
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)'],
};
