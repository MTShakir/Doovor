import { describe, expect, it } from 'vitest';
import { formatUkMobile, normaliseUkMobile } from '../phone.ts';
import { phoneCodeSchema, roleChoiceSchema, signInSchema, signUpSchema, ukMobileSchema } from './auth.ts';

describe('normaliseUkMobile (AUTH-02)', () => {
  it('accepts the common written forms', () => {
    for (const input of ['07700 900001', '07700900001', '+44 7700 900001', '+447700900001', '0044 7700 900001', '447700900001', '(07700) 900-001']) {
      expect(normaliseUkMobile(input)).toBe('+447700900001');
    }
  });

  it('rejects landlines, short numbers and other countries', () => {
    for (const input of ['0113 496 0000', '07700 90000', '+1 202 555 0100', 'hello', '', '+44 7700 9000011']) {
      expect(normaliseUkMobile(input)).toBeNull();
    }
  });

  it('formats for display', () => {
    expect(formatUkMobile('+447700900001')).toBe('07700 900001');
    // As Supabase Auth stores it, with no plus sign.
    expect(formatUkMobile('447700900001')).toBe('07700 900001');
    expect(formatUkMobile('+12025550100')).toBe('+12025550100');
  });
});

describe('auth schemas', () => {
  it('trims and lower-cases email', () => {
    expect(signInSchema.parse({ email: '  Sam@Example.COM ', password: 'x' }).email).toBe('sam@example.com');
  });

  it('explains what to fix', () => {
    const result = signUpSchema.safeParse({ fullName: '', email: 'nope', password: 'short', role: 'learner' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
      expect(messages).toEqual({
        fullName: 'Enter your name',
        email: 'Enter an email address like name@example.com',
        password: 'Use at least 8 characters',
      });
    }
  });

  it('asks schools for their name', () => {
    const result = signUpSchema.safeParse({ fullName: 'Ben', email: 'ben@example.com', password: 'longenough', role: 'school' });
    expect(result.success).toBe(false);
    expect(roleChoiceSchema.safeParse({ role: 'school', schoolName: 'Bee School' }).success).toBe(true);
    expect(roleChoiceSchema.safeParse({ role: 'learner' }).success).toBe(true);
  });

  it('normalises phone numbers and checks codes', () => {
    expect(ukMobileSchema.parse('07700 900001')).toBe('+447700900001');
    expect(phoneCodeSchema.safeParse({ phone: '07700900001', code: '12345' }).success).toBe(false);
    expect(phoneCodeSchema.parse({ phone: '07700900001', code: ' 123456 ' })).toEqual({ phone: '+447700900001', code: '123456' });
  });
});
