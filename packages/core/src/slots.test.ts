import { describe, expect, it } from 'vitest';
import { openWindows, type TimeRange } from './availability.ts';
import { blockedRange, bookableSlots, slotProblem, slotWarnings, type SlotRules } from './slots.ts';

const at = (iso: string): Date => new Date(iso);
const range = (from: string, to: string): TimeRange => ({ startsAt: at(from), endsAt: at(to) });
const times = (slots: Date[]): string[] => slots.map((slot) => slot.toISOString());

// Tuesday 15 September 2026, nine to five, British Summer Time.
const tuesday = openWindows({ hours: [{ weekday: 2, start: '09:00', end: '17:00' }], from: '2026-09-15', to: '2026-09-15' });
const now = at('2026-09-10T09:00:00Z');

const rules: SlotRules = {
  durationMinutes: 60,
  stepMinutes: 30,
  bufferMinutes: 30,
  noticeHours: 24,
  horizonWeeks: 8,
};

describe('bookableSlots (R-04, DIA-05, DIA-06)', () => {
  it('offers every half hour a lesson fits into', () => {
    const slots = bookableSlots({ windows: tuesday, rules, now, by: 'learner' });

    expect(times(slots)[0]).toBe('2026-09-15T08:00:00.000Z');
    expect(times(slots).at(-1)).toBe('2026-09-15T15:00:00.000Z');
    // 09:00 to 16:00 local, every half hour.
    expect(slots).toHaveLength(15);
  });

  it('leaves room after a lesson for the instructor to get there (D-001)', () => {
    const busy = [blockedRange(at('2026-09-15T10:00:00Z'), 60, 30)];
    const slots = times(bookableSlots({ windows: tuesday, rules, now, by: 'learner', instructorBusy: busy }));

    // The lesson runs 11:00 to 12:00 local and the travel time after it to 12:30. A new
    // lesson has to finish its own travel time before that one starts, so the last one
    // before it begins at 09:30 local and the first one after it at 12:30.
    expect(slots).toContain('2026-09-15T08:30:00.000Z');
    expect(slots).not.toContain('2026-09-15T09:00:00.000Z');
    expect(slots).not.toContain('2026-09-15T09:30:00.000Z');
    expect(slots).not.toContain('2026-09-15T10:00:00.000Z');
    expect(slots).not.toContain('2026-09-15T10:30:00.000Z');
    expect(slots).toContain('2026-09-15T11:30:00.000Z');
  });

  it('keeps a lesson that would run past the end of the day out of it', () => {
    const longer = { ...rules, durationMinutes: 120 };
    const slots = times(bookableSlots({ windows: tuesday, rules: longer, now, by: 'learner' }));

    // The last two hour lesson of the day starts at 15:00 local.
    expect(slots.at(-1)).toBe('2026-09-15T14:00:00.000Z');
  });

  it('respects how soon a learner may book (DIA-06)', () => {
    const slots = times(
      bookableSlots({ windows: tuesday, rules, now: at('2026-09-14T22:00:00Z'), by: 'learner' }),
    );

    // Twenty four hours notice from ten at night means nothing before ten the next night.
    expect(slots).toEqual([]);
  });

  it('and how far ahead the diary is open', () => {
    const soon = { ...rules, horizonWeeks: 1 };
    const slots = bookableSlots({ windows: tuesday, rules: soon, now: at('2026-09-01T09:00:00Z'), by: 'learner' });

    expect(slots).toEqual([]);
  });

  it('lets an instructor book right now, where a learner would be too late', () => {
    const morning = at('2026-09-15T08:00:00Z');
    const asLearner = bookableSlots({ windows: tuesday, rules, now: morning, by: 'learner' });
    const asInstructor = bookableSlots({ windows: tuesday, rules, now: morning, by: 'instructor' });

    expect(asLearner).toEqual([]);
    expect(times(asInstructor)[0]).toBe('2026-09-15T08:00:00.000Z');
  });

  it('narrows to the stretch of time asked for', () => {
    const slots = times(
      bookableSlots({
        windows: tuesday,
        rules,
        now,
        by: 'learner',
        within: range('2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z'),
      }),
    );

    expect(slots).toEqual(['2026-09-15T12:00:00.000Z', '2026-09-15T12:30:00.000Z', '2026-09-15T13:00:00.000Z']);
  });

  it('offers nothing at all on a day the instructor is not open', () => {
    expect(bookableSlots({ windows: [], rules, now, by: 'learner' })).toEqual([]);
  });

  it('keeps the starts on the clock the day the clocks go back', () => {
    // Sunday 25 October 2026: nine to one local, with an extra hour inside the morning.
    const sunday = openWindows({
      hours: [{ weekday: 7, start: '09:00', end: '13:00' }],
      from: '2026-10-25',
      to: '2026-10-25',
    });
    const slots = bookableSlots({ windows: sunday, rules, now: at('2026-10-01T09:00:00Z'), by: 'learner' });

    // Local nine to noon, which is the same in UTC once the clocks have gone back.
    expect(times(slots)[0]).toBe('2026-10-25T09:00:00.000Z');
    expect(times(slots).at(-1)).toBe('2026-10-25T12:00:00.000Z');
  });
});

describe('slotProblem (R-02, R-03, R-04)', () => {
  const request = {
    rules,
    windows: tuesday,
    now,
    by: 'learner' as const,
  };

  it('says a slot is free when it is', () => {
    expect(slotProblem({ ...request, startsAt: at('2026-09-15T09:00:00Z') })).toBeNull();
  });

  it('says when the instructor is already busy then', () => {
    expect(
      slotProblem({
        ...request,
        startsAt: at('2026-09-15T09:00:00Z'),
        instructorBusy: [blockedRange(at('2026-09-15T09:30:00Z'), 60, 30)],
      }),
    ).toBe('SLOT_TAKEN');
  });

  it('says when the learner is already in a lesson then (R-03)', () => {
    expect(
      slotProblem({
        ...request,
        startsAt: at('2026-09-15T09:00:00Z'),
        learnerBusy: [range('2026-09-15T09:30:00Z', '2026-09-15T10:30:00Z')],
      }),
    ).toBe('LEARNER_BUSY');
  });

  it('lets a learner book right after somebody else, because the buffer is theirs not the learners', () => {
    expect(
      slotProblem({
        ...request,
        startsAt: at('2026-09-15T10:30:00Z'),
        learnerBusy: [range('2026-09-15T09:30:00Z', '2026-09-15T10:30:00Z')],
      }),
    ).toBeNull();
  });

  it('names each rule a learner runs into', () => {
    expect(slotProblem({ ...request, startsAt: at('2026-09-10T14:00:00Z') })).toBe('NOTICE_TOO_SHORT');
    expect(slotProblem({ ...request, startsAt: at('2027-09-15T09:00:00Z') })).toBe('BEYOND_HORIZON');
    expect(slotProblem({ ...request, startsAt: at('2026-09-15T17:00:00Z') })).toBe('OUTSIDE_AVAILABILITY');
  });

  it('holds an instructor to nothing but a free diary (R-04)', () => {
    const asInstructor = { ...request, by: 'instructor' as const };

    expect(slotProblem({ ...asInstructor, startsAt: at('2026-09-15T17:00:00Z') })).toBeNull();
    expect(slotProblem({ ...asInstructor, startsAt: at('2026-09-10T09:30:00Z') })).toBeNull();
    expect(
      slotProblem({
        ...asInstructor,
        startsAt: at('2026-09-15T09:00:00Z'),
        instructorBusy: [blockedRange(at('2026-09-15T09:00:00Z'), 60, 30)],
      }),
    ).toBe('SLOT_TAKEN');
  });
});

describe('slotWarnings (R-04)', () => {
  it('tells an instructor what is unusual about what they are about to do', () => {
    expect(
      slotWarnings({ startsAt: at('2026-09-15T19:00:00Z'), rules, windows: tuesday, now, by: 'instructor' }),
    ).toEqual(['OUTSIDE_AVAILABILITY']);
  });

  it('says when it is in the past as well', () => {
    expect(
      slotWarnings({
        startsAt: at('2026-09-01T09:00:00Z'),
        rules,
        windows: tuesday,
        now,
        by: 'instructor',
      }),
    ).toEqual(['OUTSIDE_AVAILABILITY', 'TOO_CLOSE']);
  });

  it('has nothing to warn a learner about, because they are refused instead', () => {
    expect(slotWarnings({ startsAt: at('2026-09-15T19:00:00Z'), rules, windows: tuesday, now, by: 'learner' })).toEqual(
      [],
    );
  });
});
