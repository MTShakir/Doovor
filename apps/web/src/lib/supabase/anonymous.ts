import 'server-only';
import type { Database } from '@repo/db/types';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';
import { resilientFetch } from './resilient-fetch';

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * A client signed in as nobody, for what the public pages read (PUB-01, M5-02). It reads no
 * cookies, so a page can keep one answer for everybody (`'use cache'`), and it sees only what
 * the database gives a stranger. Anything a signed-in person reads still goes through
 * `createSupabaseServerClient`.
 */
export function getSupabaseAnonymousClient() {
  client ??= createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: resilientFetch },
  });
  return client;
}
