import { describe, expect, it } from 'vitest';
import {
  clipRanges,
  mergeRanges,
  openMinutes,
  openWindows,
  subtractRanges,
  windowsForDay,
  type TimeRange,
  type WorkingHour,
} from './availability.ts';

const at = (iso: string): Date => new Date(iso);
const range = (from: string, to: string): TimeRange => ({ startsAt: at(from), endsAt: at(to) });
const shown = (ranges: TimeRange[]): string[] =>
  ranges.map((one) => `${one.startsAt.toISOString()} to ${one.endsAt.toISOString()}`);

describe('mergeRanges', () => {
  it('joins what overlaps and what touches', () => {
    const merged = mergeRanges([
      range('2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z'),
      range('2026-09-15T10:30:00Z', '2026-09-15T12:00:00Z'),
      range('2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z'),
    ]);

    expect(shown(merged)).toEqual(['2026-09-15T10:00:00.000Z to 2026-09-15T13:00:00.000Z']);
  });

  it('leaves a real gap alone, and puts them in order', () => {
    const merged = mergeRanges([
      range('2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z'),
      range('2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z'),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.startsAt.toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });

  it('drops anything with no length', () => {
    expect(mergeRanges([range('2026-09-15T10:00:00Z', '2026-09-15T10:00:00Z')])).toEqual([]);
  });
});

describe('subtractRanges', () => {
  it('cuts a hole in the middle', () => {
    const left = subtractRanges(
      [range('2026-09-15T09:00:00Z', '2026-09-15T17:00:00Z')],
      [range('2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z')],
    );

    expect(shown(left)).toEqual([
      '2026-09-15T09:00:00.000Z to 2026-09-15T12:00:00.000Z',
      '2026-09-15T13:00:00.000Z to 2026-09-15T17:00:00.000Z',
    ]);
  });

  it('takes a whole window out when the day is blocked', () => {
    const left = subtractRanges(
      [range('2026-09-15T09:00:00Z', '2026-09-15T17:00:00Z')],
      [range('2026-09-15T00:00:00Z', '2026-09-16T00:00:00Z')],
    );

    expect(left).toEqual([]);
  });

  it('trims the ends without touching what is outside', () => {
    const left = subtractRanges(
      [range('2026-09-15T09:00:00Z', '2026-09-15T17:00:00Z')],
      [range('2026-09-15T08:00:00Z', '2026-09-15T10:00:00Z'), range('2026-09-15T16:00:00Z', '2026-09-15T18:00:00Z')],
    );

    expect(shown(left)).toEqual(['2026-09-15T10:00:00.000Z to 2026-09-15T16:00:00.000Z']);
  });
});

describe('clipRanges', () => {
  it('keeps only what is inside', () => {
    const clipped = clipRanges(
      [range('2026-09-14T09:00:00Z', '2026-09-14T17:00:00Z'), range('2026-09-15T09:00:00Z', '2026-09-15T17:00:00Z')],
      range('2026-09-15T00:00:00Z', '2026-09-15T12:00:00Z'),
    );

    expect(shown(clipped)).toEqual(['2026-09-15T09:00:00.000Z to 2026-09-15T12:00:00.000Z']);
  });
});

describe('windowsForDay (R-04, R-14)', () => {
  const nineToFive: WorkingHour[] = [{ weekday: 2, start: '09:00', end: '17:00' }];

  it('is empty on a day the instructor does not work', () => {
    expect(windowsForDay(nineToFive, '2026-09-16')).toEqual([]);
  });

  it('turns local hours into the instants they actually are, in summer', () => {
    // Tuesday 15 September 2026 is British Summer Time, an hour ahead of UTC.
    expect(shown(windowsForDay(nineToFive, '2026-09-15'))).toEqual([
      '2026-09-15T08:00:00.000Z to 2026-09-15T16:00:00.000Z',
    ]);
  });

  it('and in winter, when local time is UTC', () => {
    const monday: WorkingHour[] = [{ weekday: 1, start: '09:00', end: '17:00' }];
    expect(shown(windowsForDay(monday, '2026-01-05'))).toEqual([
      '2026-01-05T09:00:00.000Z to 2026-01-05T17:00:00.000Z',
    ]);
  });

  it('joins two windows on the same day that meet', () => {
    const split: WorkingHour[] = [
      { weekday: 2, start: '09:00', end: '12:00' },
      { weekday: 2, start: '12:00', end: '17:00' },
    ];
    expect(shown(windowsForDay(split, '2026-09-15'))).toEqual([
      '2026-09-15T08:00:00.000Z to 2026-09-15T16:00:00.000Z',
    ]);
  });

  describe('the morning the clocks go forward (2026-03-29, a Sunday)', () => {
    it('loses the hour that does not happen', () => {
      const earlyStart: WorkingHour[] = [{ weekday: 7, start: '00:30', end: '03:00' }];
      // 00:30 GMT to 03:00 BST is two hours of real time, not two and a half.
      expect(shown(windowsForDay(earlyStart, '2026-03-29'))).toEqual([
        '2026-03-29T00:30:00.000Z to 2026-03-29T02:00:00.000Z',
      ]);
      expect(openMinutes(windowsForDay(earlyStart, '2026-03-29'))).toBe(90);
    });

    it('starts a window that begins in the missing hour when the hour begins', () => {
      const inside: WorkingHour[] = [{ weekday: 7, start: '01:30', end: '04:00' }];
      expect(shown(windowsForDay(inside, '2026-03-29'))).toEqual([
        '2026-03-29T01:00:00.000Z to 2026-03-29T03:00:00.000Z',
      ]);
    });

    it('drops a window that lives entirely inside the missing hour', () => {
      const gone: WorkingHour[] = [{ weekday: 7, start: '01:00', end: '02:00' }];
      expect(windowsForDay(gone, '2026-03-29')).toEqual([]);
    });

    it('leaves an ordinary working day on that date alone', () => {
      const sunday: WorkingHour[] = [{ weekday: 7, start: '09:00', end: '13:00' }];
      expect(openMinutes(windowsForDay(sunday, '2026-03-29'))).toBe(240);
    });
  });

  describe('the morning the clocks go back (2026-10-25, a Sunday)', () => {
    it('counts the hour that happens twice', () => {
      const earlyStart: WorkingHour[] = [{ weekday: 7, start: '00:30', end: '03:00' }];
      // 00:30 BST to 03:00 GMT is three and a half hours of real time.
      expect(shown(windowsForDay(earlyStart, '2026-10-25'))).toEqual([
        '2026-10-24T23:30:00.000Z to 2026-10-25T03:00:00.000Z',
      ]);
      expect(openMinutes(windowsForDay(earlyStart, '2026-10-25'))).toBe(210);
    });

    it('takes the first of two identical local times', () => {
      const ambiguous: WorkingHour[] = [{ weekday: 7, start: '00:30', end: '01:30' }];
      expect(shown(windowsForDay(ambiguous, '2026-10-25'))).toEqual([
        '2026-10-24T23:30:00.000Z to 2026-10-25T00:30:00.000Z',
      ]);
    });

    it('leaves an ordinary working day on that date alone', () => {
      const sunday: WorkingHour[] = [{ weekday: 7, start: '09:00', end: '13:00' }];
      expect(openMinutes(windowsForDay(sunday, '2026-10-25'))).toBe(240);
    });
  });
});

describe('openWindows (R-04)', () => {
  const week: WorkingHour[] = [
    { weekday: 1, start: '09:00', end: '17:00' },
    { weekday: 2, start: '09:00', end: '17:00' },
    { weekday: 6, start: '09:00', end: '13:00' },
  ];

  it('walks the days and keeps only the ones worked', () => {
    const windows = openWindows({ hours: week, from: '2026-09-14', to: '2026-09-20' });

    expect(shown(windows)).toEqual([
      '2026-09-14T08:00:00.000Z to 2026-09-14T16:00:00.000Z',
      '2026-09-15T08:00:00.000Z to 2026-09-15T16:00:00.000Z',
      '2026-09-19T08:00:00.000Z to 2026-09-19T12:00:00.000Z',
    ]);
  });

  it('takes time off out of the middle of a day', () => {
    const windows = openWindows({
      hours: week,
      exceptions: [{ kind: 'blocked', ...range('2026-09-14T11:00:00Z', '2026-09-14T13:00:00Z') }],
      from: '2026-09-14',
      to: '2026-09-14',
    });

    expect(shown(windows)).toEqual([
      '2026-09-14T08:00:00.000Z to 2026-09-14T11:00:00.000Z',
      '2026-09-14T13:00:00.000Z to 2026-09-14T16:00:00.000Z',
    ]);
  });

  it('adds extra hours on a day that is not normally worked', () => {
    const windows = openWindows({
      hours: week,
      exceptions: [{ kind: 'open', ...range('2026-09-20T12:00:00Z', '2026-09-20T15:00:00Z') }],
      from: '2026-09-20',
      to: '2026-09-20',
    });

    expect(shown(windows)).toEqual(['2026-09-20T12:00:00.000Z to 2026-09-20T15:00:00.000Z']);
  });

  it('lets time off win over extra hours that cover the same moment', () => {
    const windows = openWindows({
      hours: [],
      exceptions: [
        { kind: 'open', ...range('2026-09-20T12:00:00Z', '2026-09-20T15:00:00Z') },
        { kind: 'blocked', ...range('2026-09-20T13:00:00Z', '2026-09-20T14:00:00Z') },
      ],
      from: '2026-09-20',
      to: '2026-09-20',
    });

    expect(shown(windows)).toEqual([
      '2026-09-20T12:00:00.000Z to 2026-09-20T13:00:00.000Z',
      '2026-09-20T14:00:00.000Z to 2026-09-20T15:00:00.000Z',
    ]);
  });

  it('keeps extra hours inside the days asked for', () => {
    const windows = openWindows({
      hours: [],
      exceptions: [{ kind: 'open', ...range('2026-09-19T22:00:00Z', '2026-09-20T02:00:00Z') }],
      from: '2026-09-14',
      to: '2026-09-19',
    });

    // The days asked for end at midnight local, which is 23:00 UTC in September.
    expect(shown(windows)).toEqual(['2026-09-19T22:00:00.000Z to 2026-09-19T23:00:00.000Z']);
  });
});
