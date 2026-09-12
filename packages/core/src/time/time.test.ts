import { describe, expect, it } from 'vitest';
import {
  addDaysToLocalDate,
  classifyLocalTime,
  DEFAULT_TIME_ZONE,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDateWithYear,
  formatTime,
  isoWeekday,
  isValidLocalDate,
  isValidLocalTime,
  localToUtc,
  minutesToLocalTime,
  localTimeToMinutes,
  utcToLocal,
} from './index.ts';

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('formatting in Europe/London (PRD 7.6)', () => {
  it('formats dates as "Tue 15 Sep" and times as "14:30"', () => {
    const instant = new Date('2026-09-15T13:30:00Z'); // 14:30 BST
    expect(formatDate(instant)).toBe('Tue 15 Sep');
    expect(formatTime(instant)).toBe('14:30');
    expect(formatDateTime(instant)).toBe('Tue 15 Sep, 14:30');
    expect(formatDateWithYear(instant)).toBe('Tue 15 Sep 2026');
  });

  it('uses GMT in winter', () => {
    expect(formatTime(new Date('2026-12-01T09:00:00Z'))).toBe('09:00');
  });

  it('shows the London date when UTC is still the day before', () => {
    // 23:30 UTC on 14 Sep is 00:30 BST on 15 Sep.
    expect(formatDate(new Date('2026-09-14T23:30:00Z'))).toBe('Tue 15 Sep');
  });

  it('defaults to Europe/London', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Europe/London');
  });
});

describe('localToUtc (R-14)', () => {
  it('converts ordinary local times', () => {
    expect(iso(localToUtc('2026-09-15', '14:30'))).toBe('2026-09-15T13:30:00.000Z');
    expect(iso(localToUtc('2026-12-01', '09:00'))).toBe('2026-12-01T09:00:00.000Z');
  });

  it('returns null for times skipped when clocks go forward (29 Mar 2026, 28 Mar 2027)', () => {
    expect(localToUtc('2026-03-29', '01:00')).toBeNull();
    expect(localToUtc('2026-03-29', '01:59')).toBeNull();
    expect(localToUtc('2027-03-28', '01:30')).toBeNull();
    expect(iso(localToUtc('2026-03-29', '00:59'))).toBe('2026-03-29T00:59:00.000Z');
    expect(iso(localToUtc('2026-03-29', '02:00'))).toBe('2026-03-29T01:00:00.000Z');
  });

  it('picks the first occurrence for times repeated when clocks go back (25 Oct 2026, 31 Oct 2027)', () => {
    expect(iso(localToUtc('2026-10-25', '01:30'))).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(localToUtc('2027-10-31', '01:00'))).toBe('2027-10-31T00:00:00.000Z');
    expect(iso(localToUtc('2026-10-25', '02:00'))).toBe('2026-10-25T02:00:00.000Z');
  });

  it('classifies local times around clock changes', () => {
    expect(classifyLocalTime('2026-03-29', '01:30')).toBe('nonexistent');
    expect(classifyLocalTime('2026-10-25', '01:30')).toBe('ambiguous');
    expect(classifyLocalTime('2026-10-25', '02:30')).toBe('normal');
  });

  it('keeps a weekly 09:00 lesson at 09:00 London across the March change (acceptance test 9)', () => {
    const before = localToUtc('2026-03-22', '09:00');
    const after = localToUtc('2026-03-29', '09:00');
    expect(iso(before)).toBe('2026-03-22T09:00:00.000Z');
    expect(iso(after)).toBe('2026-03-29T08:00:00.000Z');
    expect(before && formatTime(before)).toBe('09:00');
    expect(after && formatTime(after)).toBe('09:00');
  });

  it('rejects malformed input', () => {
    expect(() => localToUtc('2026-02-30', '09:00')).toThrow(/date/);
    expect(() => localToUtc('2026-09-15', '24:00')).toThrow(/time/);
    expect(() => localToUtc('15/09/2026', '09:00')).toThrow(/date/);
  });
});

describe('utcToLocal', () => {
  it('returns London wall-clock parts and ISO weekday', () => {
    expect(utcToLocal(new Date('2026-09-15T13:30:00Z'))).toEqual({
      date: '2026-09-15',
      time: '14:30',
      weekday: 2,
    });
    expect(utcToLocal(new Date('2026-09-13T08:00:00Z')).weekday).toBe(7); // Sunday
  });

  it('round-trips with localToUtc', () => {
    const instant = localToUtc('2026-11-02', '17:45');
    expect(instant && utcToLocal(instant)).toMatchObject({ date: '2026-11-02', time: '17:45' });
  });
});

describe('calendar helpers', () => {
  it('adds days to a local date across months, years and clock changes', () => {
    expect(addDaysToLocalDate('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToLocalDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToLocalDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToLocalDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('computes ISO weekdays (Mon 1 to Sun 7)', () => {
    expect(isoWeekday('2026-09-14')).toBe(1);
    expect(isoWeekday('2026-09-20')).toBe(7);
  });

  it('validates local dates and times', () => {
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalTime('08:00')).toBe(true);
    expect(isValidLocalTime('8:00')).toBe(false);
    expect(isValidLocalTime('23:60')).toBe(false);
  });

  it('converts between HH:mm and minutes after midnight', () => {
    expect(localTimeToMinutes('08:30')).toBe(510);
    expect(minutesToLocalTime(510)).toBe('08:30');
    expect(minutesToLocalTime(0)).toBe('00:00');
    expect(() => minutesToLocalTime(1440)).toThrow();
  });
});

describe('calendar dates with no instant behind them (PRD 7.6)', () => {
  it('formats a date the way the product writes dates', () => {
    expect(formatCalendarDate('2027-11-16')).toBe('Tue 16 Nov 2027');
    expect(formatCalendarDate('2026-09-12', { year: false })).toBe('Sat 12 Sep');
  });

  it('does not shift the day, whatever the machine thinks the zone is', () => {
    // A date read as an instant at midnight would slip to the day before, west of Greenwich.
    expect(formatCalendarDate('2026-01-01')).toBe('Thu 1 Jan 2026');
    expect(formatCalendarDate('2026-06-30')).toBe('Tue 30 Jun 2026');
  });
});
