import { describe, expect, it } from 'vitest';
import { base32Decode, totp } from './totp';

// RFC 6238 Appendix B test vectors (SHA-1). The seed is ASCII "12345678901234567890".
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('decodes base32', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC 6238 vector at %i seconds', (seconds, expected) => {
    expect(totp(RFC_SECRET, { now: seconds * 1000, digits: 8 })).toBe(expected);
  });

  it('produces 6-digit codes by default', () => {
    expect(totp(RFC_SECRET, { now: 59_000 })).toBe('287082');
  });

  it('rejects invalid secrets', () => {
    expect(() => base32Decode('NOT*BASE32')).toThrow(/Invalid base32/);
  });
});
