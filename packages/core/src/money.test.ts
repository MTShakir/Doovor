import { describe, expect, it } from 'vitest';
import { applyPercent, assertPence, formatPence, isPence, parsePoundsToPence, sumPence } from './money.ts';

describe('formatPence', () => {
  it('shows whole pounds without pence (PRD 7.6)', () => {
    expect(formatPence(4200)).toBe('£42');
    expect(formatPence(0)).toBe('£0');
  });

  it('shows pence when there are any', () => {
    expect(formatPence(4250)).toBe('£42.50');
    expect(formatPence(4205)).toBe('£42.05');
    expect(formatPence(1)).toBe('£0.01');
  });

  it('can always show pence, for receipts', () => {
    expect(formatPence(4200, { alwaysShowPence: true })).toBe('£42.00');
  });

  it('groups thousands', () => {
    expect(formatPence(123456)).toBe('£1,234.56');
    expect(formatPence(38000)).toBe('£380');
  });

  it('uses a plain hyphen for negative amounts', () => {
    expect(formatPence(-500)).toBe('-£5');
  });

  it('rejects non-integer values', () => {
    expect(() => formatPence(42.5)).toThrow(/integer pence/);
    expect(() => formatPence(Number.NaN)).toThrow(/integer pence/);
  });
});

describe('parsePoundsToPence', () => {
  it('parses pounds and pence without floating point maths', () => {
    expect(parsePoundsToPence('42')).toBe(4200);
    expect(parsePoundsToPence('42.5')).toBe(4250);
    expect(parsePoundsToPence('42.50')).toBe(4250);
    expect(parsePoundsToPence('0.07')).toBe(7);
    expect(parsePoundsToPence('£1,234.56')).toBe(123456);
    expect(parsePoundsToPence(' 38 ')).toBe(3800);
    // 0.1 + 0.2 style float errors must not appear.
    expect(parsePoundsToPence('19.99')).toBe(1999);
  });

  it('returns null for invalid input', () => {
    for (const bad of ['', 'abc', '42.505', '-5', '4.2.1', '.', '£', '1e3']) {
      expect(parsePoundsToPence(bad)).toBeNull();
    }
  });
});

describe('applyPercent', () => {
  it('returns integer pence, rounding halves up', () => {
    expect(applyPercent(4200, 100)).toBe(4200);
    expect(applyPercent(4200, 50)).toBe(2100);
    expect(applyPercent(4225, 50)).toBe(2113);
    expect(applyPercent(4200, 0)).toBe(0);
  });

  it('rejects percentages outside 0 to 100', () => {
    expect(() => applyPercent(4200, 101)).toThrow();
    expect(() => applyPercent(4200, -1)).toThrow();
  });
});

describe('pence guards', () => {
  it('recognises integer pence', () => {
    expect(isPence(4200)).toBe(true);
    expect(isPence(-1)).toBe(true);
    expect(isPence(0.5)).toBe(false);
    expect(isPence(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('assertPence throws with a clear message', () => {
    expect(() => {
      assertPence(1.5, 'price');
    }).toThrow('price must be integer pence');
  });

  it('sums integer pence', () => {
    expect(sumPence([4200, 3800, 1])).toBe(8001);
    expect(sumPence([])).toBe(0);
  });
});
