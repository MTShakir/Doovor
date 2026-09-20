import { describe, expect, it } from 'vitest';
import { formatElapsed, lessonToStart, needsRecord, nextLesson, startWindowMinutes, type DayLesson } from './lesson-records.ts';

const at = (time: string) => new Date(`2026-09-15T${time}:00+01:00`);

const lesson = (id: string, starts: string, ends: string, overrides: Partial<DayLesson> = {}): DayLesson => ({
  id,
  startsAt: at(starts),
  endsAt: at(ends),
  status: 'confirmed',
  recorded: false,
  ...overrides,
});

describe('the lesson "Start lesson" means (PRD 7.5, M4-04, D-178)', () => {
  const day = [
    lesson('early', '08:00', '09:00'),
    lesson('late', '14:00', '15:30'),
    lesson('mid', '10:00', '11:00'),
    lesson('off', '12:00', '13:00', { status: 'cancelled' }),
  ];

  it('is the next lesson going ahead, once it is close enough to start', () => {
    expect(lessonToStart(day, at('09:46'))?.id).toBe('mid');
    expect(lessonToStart(day, at('09:45'))?.id).toBe('mid');
  });

  it('is nothing while the next lesson is still more than a quarter of an hour away', () => {
    expect(lessonToStart(day, at('09:30'))).toBeNull();
    expect(lessonToStart(day, at('11:30'))).toBeNull();
    expect(startWindowMinutes).toBe(15);
  });

  it('is the lesson under way until it ends', () => {
    expect(lessonToStart(day, at('10:40'))?.id).toBe('mid');
    expect(lessonToStart([lesson('going', '10:00', '11:00', { status: 'in_progress' })], at('10:05'))?.id).toBe('going');
  });

  it('skips a lesson that was called off, and has nothing once the day is over', () => {
    expect(lessonToStart(day, at('13:50'))?.id).toBe('late');
    expect(lessonToStart(day, at('15:30'))).toBeNull();
    expect(lessonToStart([lesson('asked', '16:00', '17:00', { status: 'requested' })], at('15:55'))).toBeNull();
  });
});

describe('a lesson that still needs its record (PRD 10.2, M4-05)', () => {
  it('is one that has started and was, or is being, taught', () => {
    expect(needsRecord(lesson('a', '08:00', '09:00'), at('09:10'))).toBe(true);
    expect(needsRecord(lesson('b', '08:00', '09:00', { status: 'in_progress' }), at('08:30'))).toBe(true);
    expect(needsRecord(lesson('c', '08:00', '09:00', { status: 'completed' }), at('12:00'))).toBe(true);
  });

  it('is not one that is recorded, still to come, called off or not turned up to', () => {
    expect(needsRecord(lesson('a', '08:00', '09:00', { recorded: true }), at('09:10'))).toBe(false);
    expect(needsRecord(lesson('b', '14:00', '15:00'), at('09:10'))).toBe(false);
    expect(needsRecord(lesson('c', '08:00', '09:00', { status: 'cancelled' }), at('09:10'))).toBe(false);
    expect(needsRecord(lesson('d', '08:00', '09:00', { status: 'no_show' }), at('09:10'))).toBe(false);
  });
});

describe('how long a lesson has been running (PRD 7.5, M4-04)', () => {
  it('reads like a clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7)).toBe('0:07');
    expect(formatElapsed(754)).toBe('12:34');
    expect(formatElapsed(3723)).toBe('1:02:03');
  });

  it('never runs backwards or shows a fraction', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(59.9)).toBe('0:59');
  });
});

describe('the lesson they are going to next (PRD 7.5, D-190)', () => {
  const day = [
    lesson('early', '08:00', '09:00'),
    lesson('late', '14:00', '15:30'),
    lesson('mid', '10:00', '11:00'),
    lesson('off', '12:00', '13:00', { status: 'cancelled' }),
  ];

  it('is the first one still to come, however far off it is', () => {
    expect(nextLesson(day, at('07:00'))?.id).toBe('early');
    expect(nextLesson(day, at('09:30'))?.id).toBe('mid');
    expect(nextLesson(day, at('11:30'))?.id).toBe('late');
  });

  it('is the one under way while it is on', () => {
    expect(nextLesson(day, at('10:30'))?.id).toBe('mid');
  });

  it('skips a lesson that was called off, and ends the day with nothing left', () => {
    expect(nextLesson(day, at('11:05'))?.id).toBe('late');
    expect(nextLesson(day, at('16:00'))).toBeNull();
  });

  it('is what Start lesson picks from, so the two never disagree', () => {
    expect(lessonToStart(day, at('09:50'))?.id).toBe(nextLesson(day, at('09:50'))?.id);
  });
});
