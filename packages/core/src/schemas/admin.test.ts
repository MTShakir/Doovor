import { describe, expect, it } from 'vitest';
import {
  adminSearchSchema,
  auditLogSearchSchema,
  businessIdSchema,
  encodeAuditCursor,
  postcodeAreaSchema,
  suspendAccountSchema,
  suspendBusinessSchema,
  userIdSchema,
} from './admin';

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

describe('what the audit log reads from its address (ADM-07, M5-22)', () => {
  const id = '0b7e8c1d-2f3a-4b5c-8d6e-7f8091a2b3c4';

  it('reads every filter, and where the page starts, exactly to the fraction of a second', () => {
    const at = '2026-09-17T11:13:17.418959+00:00';
    expect(
      auditLogSearchSchema.parse({
        kind: 'viewing',
        person: '  lee@example.com ',
        business: 'Quayside',
        from: '2026-09-01',
        to: '2026-09-17',
        before: encodeAuditCursor({ at, id }),
      }),
    ).toEqual({ kind: 'viewing', person: 'lee@example.com', business: 'Quayside', from: '2026-09-01', to: '2026-09-17', before: { at, id } });
  });

  it('opens the whole log from an address with no filters', () => {
    expect(auditLogSearchSchema.parse({})).toEqual({ kind: undefined, person: '', business: '', from: undefined, to: undefined, before: undefined });
  });

  it('leaves out a filter that does not read as one, rather than refusing the page', () => {
    expect(
      auditLogSearchSchema.parse({ kind: 'everything', person: 'x'.repeat(101), from: '17/09/2026', to: '', before: `yesterday_${id}` }),
    ).toEqual({ kind: undefined, person: '', business: '', from: undefined, to: undefined, before: undefined });
    expect(auditLogSearchSchema.parse({ before: '2026-09-17T11:13:17Z_not-an-id' }).before).toBeUndefined();
  });

  it('takes the first of a filter given twice', () => {
    expect(auditLogSearchSchema.parse({ kind: ['refunds', 'viewing'], person: ['ann', 'bob'] })).toMatchObject({ kind: 'refunds', person: 'ann' });
  });
});
