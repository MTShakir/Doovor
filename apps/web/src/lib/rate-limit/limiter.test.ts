import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { rateLimiter } = await import('./limiter');
const { limitFor } = await import('@repo/providers/rate-limit');

describe('the Postgres limiter (NFR-SEC-03, M2-02)', () => {
  it('asks the database, with the numbers from the catalogue', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });

    expect(await rateLimiter.allow(limitFor('invite', 'u1'))).toBe(true);
    expect(rpc).toHaveBeenCalledWith('system_rate_limit_hit', {
      p_action: 'invite',
      p_who: 'u1',
      p_window_seconds: 3600,
      p_max: 30,
    });
  });

  it('passes on a refusal', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });

    expect(await rateLimiter.allow(limitFor('invite', 'u1'))).toBe(false);
  });

  it('refuses when it cannot ask, rather than letting everything through', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

    expect(await rateLimiter.allow(limitFor('booking', 'u2'))).toBe(false);
  });
});
