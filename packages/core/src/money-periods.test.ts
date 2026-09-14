import { describe, expect, it } from 'vitest';
import { moneyPeriod, periodInstants, taxYearStarting } from './money-periods.ts';

describe('the UK tax year, 6 April to 5 April (MNY-01, M3-21)', () => {
  it('turns over between 5 and 6 April, not at new year', () => {
    expect(taxYearStarting('2027-04-05')).toBe(2026);
    expect(taxYearStarting('2027-04-06')).toBe(2027);
    expect(taxYearStarting('2027-01-01')).toBe(2026);
    expect(taxYearStarting('2026-12-31')).toBe(2026);
    expect(taxYearStarting('2026-04-06')).toBe(2026);
  });

  it('runs from 6 April to 5 April the next year, whichever side of new year today is', () => {
    expect(moneyPeriod('tax_year', '2027-04-05')).toMatchObject({ from: '2026-04-06', to: '2027-04-05', label: '2026 to 2027 tax year' });
    expect(moneyPeriod('tax_year', '2027-04-06')).toMatchObject({ from: '2027-04-06', to: '2028-04-05', label: '2027 to 2028 tax year' });
    expect(moneyPeriod('tax_year', '2026-09-14').range).toBe('Mon 6 Apr 2026 to Mon 5 Apr 2027');
  });

  it('starts at midnight in London, which in summer time is still the day before in UTC', () => {
    const { from, to } = periodInstants(moneyPeriod('tax_year', '2026-09-14'));
    // 6 April 2026 is in British Summer Time, so the tax year starts at 23:00 UTC on 5 April.
    expect(from.toISOString()).toBe('2026-04-05T23:00:00.000Z');
    // And ends, not included, at midnight on 6 April 2027, also in summer time.
    expect(to.toISOString()).toBe('2027-04-05T23:00:00.000Z');
  });
});

describe('this week and this month (MNY-01)', () => {
  it('runs a week from Monday to Sunday', () => {
    expect(moneyPeriod('week', '2026-09-14')).toMatchObject({ from: '2026-09-14', to: '2026-09-20', label: 'This week' });
    expect(moneyPeriod('week', '2026-09-20')).toMatchObject({ from: '2026-09-14', to: '2026-09-20' });
    expect(moneyPeriod('week', '2026-09-21')).toMatchObject({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('runs a month from the first to its last day, leap years included', () => {
    expect(moneyPeriod('month', '2026-09-14')).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'September' });
    expect(moneyPeriod('month', '2028-02-10')).toMatchObject({ from: '2028-02-01', to: '2028-02-29', label: 'February' });
  });

  it('covers a whole month in instants across the clocks going back', () => {
    const { from, to } = periodInstants(moneyPeriod('month', '2026-10-14'));
    expect(from.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    // The clocks went back on 25 October, so November starts at midnight UTC.
    expect(to.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
