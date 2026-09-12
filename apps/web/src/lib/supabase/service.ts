import 'server-only';
import type { Database } from '@repo/db/types';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from '@/env/client';
import { serverEnv } from '@/env/server';

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * The service-role client. It ignores row-level security, so it is used only by background
 * jobs, webhooks and seeds, and only to call `system_*` functions (CLAUDE.md, rule 4).
 * Never use it to read or write a signed-in person's data: Server Actions use their session.
 */
export function getSupabaseServiceClient() {
  client ??= createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
