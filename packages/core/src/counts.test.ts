import { describe, expect, it } from 'vitest';
import { countOf, formatCount } from './counts';

describe('counts in words (M5-17)', () => {
  it('groups thousands the British way', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(4310)).toBe('4,310');
    expect(formatCount(1_250_000)).toBe('1,250,000');
    expect(formatCount(-12)).toBe('-12');
  });

  it('refuses anything that is not a whole number', () => {
    expect(() => formatCount(1.5)).toThrow(RangeError);
    expect(() => formatCount(Number.NaN)).toThrow(RangeError);
    expect(() => formatCount(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('names one thing, and nought or many things', () => {
    expect(countOf(1, 'payment', 'payments')).toBe('1 payment');
    expect(countOf(0, 'payment', 'payments')).toBe('0 payments');
    expect(countOf(3402, 'badge to check', 'badges to check')).toBe('3,402 badges to check');
  });
});
