import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { authErrorCopy } from './auth-errors';

describe('what sign-in says when Auth refuses', () => {
  it('tells somebody whose account is suspended, and how to reach us (ADM-02, M5-18)', () => {
    expect(authErrorCopy('user_banned')).toEqual({
      code: 'NOT_ALLOWED',
      message: `This account is suspended. Email ${brand.supportEmail} to talk to us about it.`,
    });
  });

  it('says what to do about a wrong password, and something plain about anything unknown', () => {
    expect(authErrorCopy('invalid_credentials')).toEqual({ code: 'VALIDATION_FAILED', message: 'Email or password is not right.' });
    expect(authErrorCopy('something_new')).toEqual({ code: 'UNKNOWN', message: 'Something went wrong. Try again.' });
    expect(authErrorCopy(undefined).code).toBe('UNKNOWN');
  });
});
