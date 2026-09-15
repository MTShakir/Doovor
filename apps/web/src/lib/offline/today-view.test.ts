import { describe, expect, it } from 'vitest';
import type { TeachingLesson } from '@/lib/lessons/teaching';
import type { KeptDay } from './kept-days';
import { readAtLabel, todayView } from './today-view';

const lesson = (id: string, startsAt: string): TeachingLesson => ({
  id,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  learnerName: 'Jack Taylor',
  lessonType: 'Standard lesson',
  pickup: null,
  facts: { status: 'confirmed', paymentStatus: 'unpaid', kind: 'standard', source: 'instructor' },
  recorded: false,
});

const page = { lessons: [lesson('from-page', '2026-09-15T08:00:00.000Z')], now: '2026-09-15T07:00:00.000Z' };
const kept: KeptDay = {
  lessons: [{ ...lesson('kept', '2026-09-15T13:00:00.000Z'), day: '2026-09-15' }],
  owner: 'user-emma',
  at: '2026-09-15T11:58:00.000Z',
  covered: true,
};
const phoneNow = new Date('2026-09-15T12:30:00.000Z');

describe('what Today shows with no signal (PRG-09, M4-10)', () => {
  it('shows what the server put together while there is signal', () => {
    expect(todayView({ online: true, page, kept, phoneNow })).toEqual({ lessons: page.lessons, now: page.now, readAt: null });
  });

  it('with no signal, shows the phone\'s copy of the day, worked out from the phone\'s clock', () => {
    expect(todayView({ online: false, page, kept, phoneNow })).toEqual({
      lessons: kept.lessons,
      now: '2026-09-15T12:30:00.000Z',
      readAt: '2026-09-15T11:58:00.000Z',
    });
  });

  it('keeps to the page it has, by the phone\'s clock, when the phone has no copy of this day', () => {
    const neverRead: KeptDay = { lessons: [], owner: null, at: null, covered: false };
    for (const copy of [null, neverRead, { ...kept, covered: false }]) {
      expect(todayView({ online: false, page, kept: copy, phoneNow })).toEqual({
        lessons: page.lessons,
        now: '2026-09-15T12:30:00.000Z',
        readAt: page.now,
      });
    }
  });

  it('believes a copy that says the day has no lessons', () => {
    const empty: KeptDay = { ...kept, lessons: [] };
    expect(todayView({ online: false, page, kept: empty, phoneNow }).lessons).toEqual([]);
  });

  it('says when the lessons shown were read, with the day when that was not today', () => {
    expect(readAtLabel('2026-09-15T11:58:00.000Z', phoneNow)).toBe('Lessons as of 12:58');
    expect(readAtLabel('2026-09-14T17:30:00.000Z', phoneNow)).toBe('Lessons as of Mon 14 Sep, 18:30');
  });
});
