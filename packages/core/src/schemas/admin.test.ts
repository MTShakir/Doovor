import { describe, expect, it } from 'vitest';
import { adminSearchSchema, businessIdSchema, postcodeAreaSchema, suspendAccountSchema, suspendBusinessSchema, userIdSchema } from './admin';

const businessId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

describe('what admin screens accept (ADM-02, M5-18)', () => {
  it('takes a search as typed, trimmed, up to 100 characters', () => {
    expect(adminSearchSchema.parse('  ls6 3hn ')).toBe('ls6 3hn');
    expect(adminSearchSchema.parse('')).toBe('');
    expect(adminSearchSchema.safeParse('x'.repeat(101)).success).toBe(false);
  });

  it('suspends a Business only with a reason, of 500 characters at most', () => {
    expect(suspendBusinessSchema.parse({ businessId, reason: '  Badge belongs to somebody else ' })).toEqual({
      businessId,
      reason: 'Badge belongs to somebody else',
    });
    const blank = suspendBusinessSchema.safeParse({ businessId, reason: '   ' });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toBe('Say why, so whoever looks at it next knows');
    expect(suspendBusinessSchema.safeParse({ businessId, reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('names a Business by its id', () => {
    expect(businessIdSchema.safeParse({ businessId }).success).toBe(true);
    expect(businessIdSchema.safeParse({ businessId: 'asha-driving' }).success).toBe(false);
  });

  it('suspends an account only with a reason, and names a person by their id', () => {
    expect(suspendAccountSchema.parse({ userId: businessId, reason: ' Abusive messages ' })).toEqual({ userId: businessId, reason: 'Abusive messages' });
    expect(suspendAccountSchema.safeParse({ userId: businessId, reason: '' }).success).toBe(false);
    expect(userIdSchema.safeParse({ userId: businessId }).success).toBe(true);
    expect(userIdSchema.safeParse({ userId: 'lee' }).success).toBe(false);
  });

  it('takes a postcode area as its letters, in capitals', () => {
    expect(postcodeAreaSchema.parse({ area: ' ls ' })).toEqual({ area: 'LS' });
    expect(postcodeAreaSchema.parse({ area: 'm' })).toEqual({ area: 'M' });
    expect(postcodeAreaSchema.safeParse({ area: 'LS6' }).success).toBe(false);
    expect(postcodeAreaSchema.safeParse({ area: 'LSX' }).success).toBe(false);
  });
});
