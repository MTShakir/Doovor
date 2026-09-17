import { describe, expect, it } from 'vitest';
import { defaultErrorCopy, domainErrorCodes, isDomainErrorCode, parsePostgresError } from './errors.ts';
import { err, ok } from './result.ts';

describe('domain errors', () => {
  it('has default copy for every code', () => {
    for (const code of domainErrorCodes) expect(defaultErrorCopy[code].length).toBeGreaterThan(0);
  });

  it('recognises codes', () => {
    expect(isDomainErrorCode('SLOT_TAKEN')).toBe(true);
    expect(isDomainErrorCode('slot_taken')).toBe(false);
    expect(isDomainErrorCode(42)).toBe(false);
  });

  it('reads a code and JSON context raised by an RPC', () => {
    const parsed = parsePostgresError({
      code: 'P0001',
      message: 'TOO_CLOSE',
      details: '{"conflict_starts_at":"2026-09-15T09:00:00Z"}',
    });
    expect(parsed).toEqual({ code: 'TOO_CLOSE', context: { conflict_starts_at: '2026-09-15T09:00:00Z' } });
  });

  it('maps an exclusion violation to SLOT_TAKEN (acceptance test 2)', () => {
    expect(parsePostgresError({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }).code).toBe(
      'SLOT_TAKEN',
    );
  });

  it('maps RLS and PostgREST errors', () => {
    expect(parsePostgresError({ code: '42501', message: 'new row violates row-level security policy' }).code).toBe(
      'NOT_ALLOWED',
    );
    expect(parsePostgresError({ code: 'PGRST116', message: 'no rows' }).code).toBe('NOT_FOUND');
  });

  it('treats a session signed out on another device as signed out (D-041)', () => {
    expect(parsePostgresError({ code: 'SESSION_ENDED', message: 'This device has been signed out.' }).code).toBe(
      'NOT_AUTHENTICATED',
    );
  });

  it('never leaks unknown database text', () => {
    const parsed = parsePostgresError({ code: 'XX000', message: 'internal error at line 3', details: 'secret' });
    expect(parsed).toEqual({ code: 'UNKNOWN', context: {} });
  });

  it('ignores context that is not a JSON object', () => {
    expect(parsePostgresError({ message: 'OVERLAP', details: 'not json' }).context).toEqual({});
    expect(parsePostgresError({ message: 'OVERLAP', details: '[1,2]' }).context).toEqual({});
    expect(parsePostgresError({ message: 'OVERLAP', details: null }).context).toEqual({});
  });
});

describe('result helpers', () => {
  it('builds ok and error results with default copy', () => {
    expect(ok({ id: 'a' })).toEqual({ ok: true, data: { id: 'a' } });
    expect(err('SLOT_TAKEN')).toEqual({ ok: false, code: 'SLOT_TAKEN', message: 'This slot was just taken.' });
    expect(err('VALIDATION_FAILED', 'Fix the form', { email: 'Enter an email' })).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Fix the form',
      fields: { email: 'Enter an email' },
    });
  });

  it('says a change was refused while staff view as somebody, and when the viewing has ended (ADM-06, M5-21)', () => {
    expect(parsePostgresError({ code: '25006', message: 'cannot execute UPDATE in a read-only transaction' }).code).toBe('READ_ONLY_SESSION');
    expect(parsePostgresError({ code: 'VIEW_AS_ENDED', message: 'Viewing as somebody else has ended.' }).code).toBe('VIEW_AS_ENDED');
  });
});
