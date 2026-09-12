import 'server-only';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** Windows older than a day tell nobody anything (NFR-SEC-03, M2-02). */
export async function clearOldRateLimits(): Promise<{ cleared: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_clear_rate_limits', {
    p_older_than: '1 day',
  });
  if (error) throw new Error(`Could not clear old rate limits: ${error.message}`);
  return { cleared: data };
}
