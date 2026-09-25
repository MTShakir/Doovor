import { describe, expect, it } from 'vitest';
import {
  isReferralCode,
  normaliseReferralCode,
  referralCodeAlphabet,
  referralCodeLength,
  referralLink,
  referralRewardMonths,
} from './referral.ts';

describe('the referral code (D-205)', () => {
  it('leaves out the characters that get confused when one is read off a screen', () => {
    for (const confusable of ['I', 'O', '0', '1']) {
      expect(referralCodeAlphabet).not.toContain(confusable);
    }
  });

  it('accepts a code of the right shape', () => {
    expect(isReferralCode('K7F2WQ9B')).toBe(true);
    expect(normaliseReferralCode('K7F2WQ9B')).toBe('K7F2WQ9B');
  });

  it('tidies away the spaces and dashes somebody adds reading it out', () => {
    expect(normaliseReferralCode('k7f2 wq9b')).toBe('K7F2WQ9B');
    expect(normaliseReferralCode('K7F2-WQ9B')).toBe('K7F2WQ9B');
    expect(normaliseReferralCode('  K7F2WQ9B  ')).toBe('K7F2WQ9B');
  });

  it('gives nothing back for what could never be a code', () => {
    expect(normaliseReferralCode('K7F2WQ9')).toBe('');
    expect(normaliseReferralCode('K7F2WQ9BB')).toBe('');
    // O and 1 are not in the alphabet, so a code containing one is not a code.
    expect(normaliseReferralCode('K7F2WQ9O')).toBe('');
    expect(normaliseReferralCode('K7F2WQ91')).toBe('');
    expect(normaliseReferralCode('')).toBe('');
    expect(normaliseReferralCode('<script>')).toBe('');
  });

  it('refuses anything that is not a string', () => {
    expect(isReferralCode(undefined)).toBe(false);
    expect(isReferralCode(12345678)).toBe(false);
    expect(isReferralCode(null)).toBe(false);
  });

  it('is eight characters, which is short enough to read out and long enough not to be guessed', () => {
    expect(referralCodeLength).toBe(8);
  });
});

describe('referralLink (D-205)', () => {
  it('carries the code to the page somebody starts from', () => {
    expect(referralLink('https://example.test', 'K7F2WQ9B')).toBe('https://example.test/start?ref=K7F2WQ9B');
  });

  it('does not double the slash when the address already ends in one', () => {
    expect(referralLink('https://example.test/', 'K7F2WQ9B')).toBe('https://example.test/start?ref=K7F2WQ9B');
  });
});

describe('what a referral earns (D-205)', () => {
  it('is one month of the paid plan', () => {
    expect(referralRewardMonths).toBe(1);
  });
});
