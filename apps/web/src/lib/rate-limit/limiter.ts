import 'server-only';
import type { RateLimit, RateLimiter } from '@repo/providers/rate-limit';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * The Postgres limiter (NFR-SEC-03, D-008, M2-02).
 *
 * `private.rate_limit_hit` is granted to nobody, so this counts through the one `system_*`
 * function that is: a limiter a caller could reach would be a limiter a caller could exhaust
 * on someone else's behalf.
 */
export const rateLimiter: RateLimiter = {
  allow: async (limit: RateLimit) => {
    const { data, error } = await getSupabaseServiceClient().rpc('system_rate_limit_hit', {
      p_action: limit.action,
      p_who: limit.who,
      p_window_seconds: limit.windowSeconds,
      p_max: limit.max,
    });
    // A limiter that cannot answer must not become a way through: refuse instead.
    if (error) return false;
    return data;
  },
};
