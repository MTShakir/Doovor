import { describe, expect, it } from 'vitest';
import { allowAll, denyAll, limitFor, rateLimitKey, rateLimits } from './types.ts';

describe('rate limits (NFR-SEC-03, D-008, M2-02)', () => {
  it('makes one key shape, so two call sites cannot disagree', () => {
    expect(rateLimitKey({ action: 'invite', who: 'u1' })).toBe('invite:u1');
    expect(rateLimitKey(limitFor('booking', 'u2'))).toBe('booking:u2');
  });

  it('takes the numbers from the catalogue, not from the call site', () => {
    expect(limitFor('invite', 'u1')).toEqual({ action: 'invite', who: 'u1', ...rateLimits.invite });
    expect(limitFor('anonymous', '1.2.3.4').who).toBe('1.2.3.4');
  });

  it('sets a window and a maximum for every action it names', () => {
    for (const [action, limit] of Object.entries(rateLimits)) {
      expect(limit.max, action).toBeGreaterThan(0);
      expect(limit.windowSeconds, action).toBeGreaterThan(0);
    }
  });

  it('has a limiter that refuses everything, for the tests that need the refusal', async () => {
    expect(await denyAll.allow(limitFor('invite', 'u1'))).toBe(false);
    expect(await allowAll.allow(limitFor('invite', 'u1'))).toBe(true);
  });
});
