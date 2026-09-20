import { describe, expect, it } from 'vitest';
import { customRange, rangeFromParams, rangeInWords, statsRange, statsRangeKeys } from './stats-range.ts';

describe('the dates a dashboard adds up over (ADM-01, D-171)', () => {
  // A Sunday, so the week runs back to the Monday before it.
  const today = '2026-09-20';

  it('has a button for each named range, in the order they are shown', () => {
    expect([...statsRangeKeys]).toEqual(['today', 'week', 'month', 'last_30_days', 'tax_year']);
  });

  it('covers today alone', () => {
    expect(statsRange('today', today)).toEqual({
      key: 'today',
      from: today,
      to: today,
      label: 'Today',
      range: 'Sun 20 Sep 2026',
    });
  });

  it('covers this week from its Monday, and this month from the first', () => {
    expect(statsRange('week', today)).toMatchObject({ from: '2026-09-14', to: '2026-09-20', label: 'This week' });
    expect(statsRange('month', today)).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'This month' });
  });

  it('counts the last 30 days as today and the 29 before it', () => {
    expect(statsRange('last_30_days', today)).toMatchObject({
      from: '2026-08-22',
      to: today,
      range: 'Sat 22 Aug 2026 to Sun 20 Sep 2026',
    });
  });

  it('runs the tax year from 6 April to 5 April, whichever side of it today falls', () => {
    expect(statsRange('tax_year', today)).toMatchObject({ from: '2026-04-06', to: '2027-04-05', label: 'Tax year' });
    expect(statsRange('tax_year', '2027-01-31')).toMatchObject({ from: '2026-04-06', to: '2027-04-05' });
    expect(statsRange('tax_year', '2027-04-06')).toMatchObject({ from: '2027-04-06', to: '2028-04-05' });
  });

  it('takes dates staff typed, the way round they meant them, and names them by their days', () => {
    expect(customRange('2026-04-06', '2026-09-20')).toEqual({
      key: 'custom',
      from: '2026-04-06',
      to: '2026-09-20',
      label: 'Mon 6 Apr 2026 to Sun 20 Sep 2026',
      range: 'Mon 6 Apr 2026 to Sun 20 Sep 2026',
    });
    expect(customRange('2026-09-20', '2026-04-06')).toMatchObject({ from: '2026-04-06', to: '2026-09-20' });
    expect(customRange('2026-09-20', '2026-09-20')).toMatchObject({ from: '2026-09-20', to: '2026-09-20', range: 'Sun 20 Sep 2026' });
  });

  it('refuses what is not a date', () => {
    expect(customRange('last tuesday', '2026-09-20')).toBeNull();
    expect(customRange('2026-09-20', '2026-13-01')).toBeNull();
    expect(customRange('', '')).toBeNull();
  });

  it('reads the range from the address, and falls back to the last 30 days', () => {
    expect(rangeFromParams({ range: 'week' }, today)).toMatchObject({ key: 'week' });
    expect(rangeFromParams({}, today)).toMatchObject({ key: 'last_30_days' });
    expect(rangeFromParams({ range: 'fortnight' }, today)).toMatchObject({ key: 'last_30_days' });
    expect(rangeFromParams({ from: '2026-04-06', to: '2026-09-20' }, today)).toMatchObject({ key: 'custom', from: '2026-04-06' });
    // Half a custom range, or one that is not a date, is no range at all.
    expect(rangeFromParams({ from: '2026-04-06' }, today)).toMatchObject({ key: 'last_30_days' });
    expect(rangeFromParams({ range: 'week', from: 'soon', to: 'later' }, today)).toMatchObject({ key: 'week' });
  });

  it('writes one day as the day, and longer as first to last', () => {
    expect(rangeInWords('2026-09-20', '2026-09-20')).toBe('Sun 20 Sep 2026');
    expect(rangeInWords('2026-09-14', '2026-09-20')).toBe('Mon 14 Sep 2026 to Sun 20 Sep 2026');
  });
});
