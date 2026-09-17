import { describe, expect, it } from 'vitest';
import { flagDefaults, flagsFromSettings, isFlagEnabled } from './flags.ts';

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

  it('reads the overrides a super admin saved, leaving anything else to its default (ADM-05)', () => {
    expect(flagsFromSettings({ google_sign_in: false, apple_sign_in: true, marketplace: 'yes', surprise: true })).toEqual({
      googleSignIn: false,
      appleSignIn: true,
    });
    expect(flagsFromSettings(null)).toEqual({});
    expect(flagsFromSettings([true])).toEqual({});
  });
});
