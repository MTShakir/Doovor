import { describe, expect, it } from 'vitest';
import {
  isSupportedTaxYear,
  mtdQuarterFor,
  mtdQuarters,
  sa103Form,
  sa103ShortLimitPence,
  taxYear,
  taxYearFor,
  taxYearsUpTo,
} from './tax-year.ts';

describe('the tax year (MNY-04, D-198)', () => {
  it('runs 6 April to 5 April and is named by the year it starts', () => {
    const year = taxYear(2026);
    expect(year.from).toBe('2026-04-06');
    expect(year.to).toBe('2027-04-05');
    expect(year.label).toBe('2026 to 2027');
  });

  it('puts the days either side of 6 April in the right year', () => {
    expect(taxYearFor('2027-04-05').starts).toBe(2026);
    expect(taxYearFor('2027-04-06').starts).toBe(2027);
    expect(taxYearFor('2026-12-31').starts).toBe(2026);
    expect(taxYearFor('2027-01-01').starts).toBe(2026);
  });

  it('offers the last few years, newest first, and none before the first it supports', () => {
    expect(taxYearsUpTo('2026-09-24').map((one) => one.starts)).toEqual([2026, 2025, 2024, 2023]);
    expect(taxYearsUpTo('2024-09-24').map((one) => one.starts)).toEqual([2024, 2023]);
    expect(isSupportedTaxYear(2022)).toBe(false);
    expect(isSupportedTaxYear(2023)).toBe(true);
  });
});

describe('the quarters Making Tax Digital reports in (MNY-04)', () => {
  it('has four, each from the 6th to the 5th, covering the whole year with no gap', () => {
    const quarters = mtdQuarters(2026);
    expect(quarters.map((one) => [one.from, one.to])).toEqual([
      ['2026-04-06', '2026-07-05'],
      ['2026-07-06', '2026-10-05'],
      ['2026-10-06', '2027-01-05'],
      ['2027-01-06', '2027-04-05'],
    ]);
    expect(quarters.map((one) => one.label)).toEqual(['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4']);
    expect(quarters.every((one) => one.taxYearStarts === 2026)).toBe(true);
  });

  it('starts where the tax year starts and ends where it ends', () => {
    const year = taxYear(2026);
    const quarters = mtdQuarters(2026);
    expect(quarters[0]?.from).toBe(year.from);
    expect(quarters[3]?.to).toBe(year.to);
  });

  it('finds the quarter a day is in, on the days it changes', () => {
    expect(mtdQuarterFor('2026-04-06').quarter).toBe(1);
    expect(mtdQuarterFor('2026-07-05').quarter).toBe(1);
    expect(mtdQuarterFor('2026-07-06').quarter).toBe(2);
    expect(mtdQuarterFor('2027-01-05').quarter).toBe(3);
    expect(mtdQuarterFor('2027-01-06').quarter).toBe(4);
    // A January day belongs to the tax year that began the previous April.
    expect(mtdQuarterFor('2027-01-06').taxYearStarts).toBe(2026);
  });
});

describe('which self-employment pages a return uses', () => {
  it('takes the short ones under the threshold and the full ones at it', () => {
    expect(sa103Form(0)).toBe('short');
    expect(sa103Form(sa103ShortLimitPence - 1)).toBe('short');
    expect(sa103Form(sa103ShortLimitPence)).toBe('full');
    expect(sa103ShortLimitPence).toBe(90_000 * 100);
  });
});
