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

/** Requests nobody answered stop holding a slot the moment they lapse (R-12, M2-18). */
export async function expireBookingRequests(): Promise<{ expired: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_expire_requests');
  if (error) throw new Error(`Could not expire booking requests: ${error.message}`);
  return { expired: data };
}

/** Invitations nobody accepted are of no use after a month (AUTH-07). */
export async function clearExpiredInvitations(): Promise<{ cleared: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_clear_expired_invitations', {
    p_older_than: '30 days',
  });
  if (error) throw new Error(`Could not clear expired invitations: ${error.message}`);
  return { cleared: data };
}
