import type { Database } from '@repo/db/types';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { clientEnv } from '@/env/client';
import { resilientFetch } from './resilient-fetch';

export interface SessionRefresh {
  response: NextResponse;
  userId: string | null;
}

/**
 * Refreshes the Supabase session cookie for this request and reports who is signed in.
 * Responses that set auth cookies carry no-cache headers so a CDN can never serve one
 * person's session to someone else.
 */
export async function refreshSession(request: NextRequest, requestHeaders: Headers): Promise<SessionRefresh> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: resilientFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Nothing may run between creating the client and this call: it performs the refresh.
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims.sub ?? null };
}

/** Copies refreshed auth cookies and cache headers onto a redirect response. */
export function withSessionCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  for (const header of ['cache-control', 'expires', 'pragma']) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}
