import { describe, expect, it } from 'vitest';
import { flagDefaults, isFlagEnabled } from './flags.ts';

describe('flags', () => {
  it('keeps Sign in with Apple hidden by default', () => {
    expect(isFlagEnabled('appleSignIn')).toBe(false);
  });

  it('keeps the marketplace off by default', () => {
    expect(flagDefaults.marketplace).toBe(false);
  });

  it('lets an override win over the default', () => {
    expect(isFlagEnabled('appleSignIn', { appleSignIn: true })).toBe(true);
    expect(isFlagEnabled('googleSignIn', { googleSignIn: false })).toBe(false);
  });
});
