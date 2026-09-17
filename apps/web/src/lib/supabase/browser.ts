'use client';

import type { Database } from '@repo/db/types';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';
import { resilientFetch } from './resilient-fetch';

/** The viewing this browser names, while platform staff view as somebody (ADM-06, D-129). */
function viewing(): string | null {
  if (typeof document === 'undefined') return null;
  const found = document.cookie.split('; ').find((part) => part.startsWith('view_as='));
  return found ? decodeURIComponent(found.slice('view_as='.length)) : null;
}

/**
 * Browser client for client components (auth flows, live data). The library keeps one per tab, so
 * starting or stopping a viewing loads the page afresh.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  const viewingAs = viewing();
  return createBrowserClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: resilientFetch, ...(viewingAs === null ? {} : { headers: { 'x-view-as': viewingAs } }) },
  });
}
