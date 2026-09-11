'use client';

import type { Database } from '@repo/db/types';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';
import { resilientFetch } from './resilient-fetch';

/** Browser client for client components (auth flows, live data). The library keeps one per tab. */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: resilientFetch },
  });
}
