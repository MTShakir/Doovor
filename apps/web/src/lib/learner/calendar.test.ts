import { describe, expect, it } from 'vitest';
import { calendarOpensOn, firstLessonDayIn, lessonDay, lessonDays, lessonsOn } from './calendar';

const at = (startsAt: string, id = startsAt) => ({ id, startsAt });

describe("a learner's lessons on a month calendar (PRD 8.2, D-170)", () => {
  it('puts a lesson on the day it is in the UK, not in UTC', () => {
    // 00:30 on Tuesday in summer time is still Monday in UTC.
    expect(lessonDay('2026-09-21T23:30:00Z')).toBe('2026-09-22');
    // In winter the two agree.
    expect(lessonDay('2026-12-01T23:30:00Z')).toBe('2026-12-01');
  });

  it('marks each day with a lesson once', () => {
    const days = lessonDays([at('2026-09-22T08:00:00Z'), at('2026-09-22T13:00:00Z'), at('2026-10-02T09:00:00Z')]);
    expect([...days].sort()).toEqual(['2026-09-22', '2026-10-02']);
  });

  it("lists a day's lessons in the order they come", () => {
    const lessons = [at('2026-09-22T08:00:00Z', 'first'), at('2026-09-23T08:00:00Z', 'other'), at('2026-09-22T13:00:00Z', 'second')];
    expect(lessonsOn(lessons, '2026-09-22').map((lesson) => lesson.id)).toEqual(['first', 'second']);
    expect(lessonsOn(lessons, '2026-09-24')).toEqual([]);
  });

  it('opens on the next lesson, in its month', () => {
    const lessons = [at('2026-10-02T09:00:00Z'), at('2026-09-22T08:00:00Z')];
    expect(calendarOpensOn(lessons, '2026-09-19')).toEqual({ month: '2026-09-01', selected: '2026-09-22' });
    // The next one next month: that month, so the calendar never opens empty on a lesson to come.
    expect(calendarOpensOn([at('2026-10-02T09:00:00Z')], '2026-09-19')).toEqual({ month: '2026-10-01', selected: '2026-10-02' });
  });

  it('opens on today with nothing booked', () => {
    expect(calendarOpensOn([], '2026-09-19')).toEqual({ month: '2026-09-01', selected: '2026-09-19' });
  });

  it('finds the first day with a lesson in a month, or none', () => {
    const lessons = [at('2026-10-14T09:00:00Z'), at('2026-10-02T09:00:00Z'), at('2026-11-03T09:00:00Z')];
    expect(firstLessonDayIn(lessons, '2026-10-01')).toBe('2026-10-02');
    expect(firstLessonDayIn(lessons, '2026-12-01')).toBeNull();
  });
});
