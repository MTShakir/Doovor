import { describe, expect, it } from 'vitest';
import { dateFrom, endOfMonth, isDiaryView, startOfMonth, startOfWeek, step, windowFor } from './range';

describe('diary windows (DIA-03, M1-19)', () => {
  it('starts a week on Monday', () => {
    // 15 September 2026 is a Tuesday.
    expect(startOfWeek('2026-09-15')).toBe('2026-09-14');
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14');
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14');
  });

  it('knows where a month begins and ends, February included', () => {
    expect(startOfMonth('2026-09-15')).toBe('2026-09-01');
    expect(endOfMonth('2026-09-15')).toBe('2026-09-30');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31');
  });

  it('covers exactly the days a view shows', () => {
    expect(windowFor('day', '2026-09-15')).toMatchObject({ from: '2026-09-15', to: '2026-09-15' });
    expect(windowFor('week', '2026-09-15')).toMatchObject({ from: '2026-09-14', to: '2026-09-20' });
    expect(windowFor('month', '2026-09-15')).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('asks the database for local midnight to local midnight, across a clock change', () => {
    // The clocks go back on 25 October 2026, so that day is 25 hours long.
    const day = windowFor('day', '2026-10-25');
    expect(day.endsAt.getTime() - day.startsAt.getTime()).toBe(25 * 60 * 60 * 1000);

    const summer = windowFor('day', '2026-09-15');
    expect(summer.endsAt.getTime() - summer.startsAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('moves by one day, one week or one month', () => {
    expect(step('day', '2026-09-15', 1)).toBe('2026-09-16');
    expect(step('day', '2026-09-15', -1)).toBe('2026-09-14');
    expect(step('week', '2026-09-15', 1)).toBe('2026-09-22');
    expect(step('month', '2026-09-15', 1)).toBe('2026-10-01');
    expect(step('month', '2026-09-15', -1)).toBe('2026-08-01');
    expect(step('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('falls back to today when the address bar says something else', () => {
    expect(dateFrom('2026-09-15')).toBe('2026-09-15');
    expect(dateFrom('yesterday')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateFrom(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('only takes the three views that exist', () => {
    expect(isDiaryView('week')).toBe(true);
    expect(isDiaryView('year')).toBe(false);
    expect(isDiaryView(undefined)).toBe(false);
  });
});

describe('no view chosen (DIA-03, M1-20)', () => {
  it('fetches the week, because the phone shows a day inside it', () => {
    expect(windowFor('responsive', '2026-09-15')).toEqual(windowFor('week', '2026-09-15'));
  });

  it('moves a week at a time, which is what the wider screen is showing', () => {
    expect(step('responsive', '2026-09-15', 1)).toBe('2026-09-22');
    expect(step('responsive', '2026-09-15', -1)).toBe('2026-09-08');
  });
});
