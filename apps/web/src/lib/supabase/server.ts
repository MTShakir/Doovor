import 'server-only';
import type { Database } from '@repo/db/types';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { clientEnv } from '@/env/client';
import { viewingId } from '@/lib/auth/view-as';
import { resilientFetch } from './resilient-fetch';

/**
 * Sign-in runs on the server, so Supabase Auth would otherwise record the server's user
 * agent and IP for every session. Forward the visitor's own, so the devices list (AUTH-09)
 * and the audit log (NFR-SEC-06) show the real device. x-forwarded-for comes from the
 * hosting platform's edge.
 */
async function visitorHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};
  const userAgent = incoming.get('user-agent');
  const forwardedFor = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip');
  if (userAgent) forwarded['User-Agent'] = userAgent;
  if (forwardedFor) forwarded['X-Forwarded-For'] = forwardedFor;
  return forwarded;
}

export interface ServerClientOptions {
  /**
   * The staff member's own requests, even while they view as somebody: starting and stopping a
   * viewing. Otherwise a viewing this browser names goes with every request (ADM-06, D-129).
   */
  asStaff?: boolean;
  /** A viewing just started, which the cookie does not carry yet. */
  viewing?: string;
}

/**
 * The signed-in user's client for Server Components, Server Actions and Route Handlers.
 * Queries run as that user, so RLS decides what exists. Create one per request. While platform
 * staff view as somebody, the database runs each request as that person, read only.
 */
export async function createSupabaseServerClient(options: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  const viewing = options.asStaff ? null : (options.viewing ?? (await viewingId()));
  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: resilientFetch,
        headers: { ...(await visitorHeaders()), ...(viewing === null ? {} : { 'x-view-as': viewing }) },
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
