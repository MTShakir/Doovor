import { describe, expect, it } from 'vitest';
import {
  byDay,
  gapsBetween,
  isOff,
  lessonState,
  lessonStateLabel,
  teachingMinutes,
  type DiaryLesson,
  type LessonFacts,
} from './diary.ts';

const standard: LessonFacts = { status: 'confirmed', paymentStatus: 'unpaid', kind: 'standard', source: 'instructor' };

function lesson(from: string, to: string, facts: Partial<LessonFacts> = {}): DiaryLesson {
  return { id: from, startsAt: new Date(from), endsAt: new Date(to), facts: { ...standard, ...facts } };
}

describe('one word for a lesson (DIA-04, M1-19)', () => {
  it('says paid when it has been paid for, however', () => {
    for (const paymentStatus of ['paid_card', 'paid_cash', 'paid_bank'] as const) {
      expect(lessonState({ ...standard, paymentStatus })).toBe('paid');
    }
  });

  it("tells credit apart from money, because it is the learner's own hours", () => {
    expect(lessonState({ ...standard, paymentStatus: 'paid_credit' })).toBe('credit');
  });

  it('says unpaid when nothing has arrived yet', () => {
    expect(lessonState(standard)).toBe('unpaid');
  });

  it('puts a test day above everything else', () => {
    expect(lessonState({ ...standard, kind: 'test_day', paymentStatus: 'paid_card' })).toBe('test-day');
  });

  it('says a lesson that is off is off, whatever was paid', () => {
    for (const status of ['cancelled', 'no_show', 'declined', 'expired'] as const) {
      expect(lessonState({ ...standard, status, paymentStatus: 'paid_card', kind: 'test_day' })).toBe('cancelled');
      expect(isOff(status)).toBe(true);
    }
    expect(isOff('confirmed')).toBe(false);
  });

  it('says pending while it is still being asked for or paid', () => {
    expect(lessonState({ ...standard, status: 'requested' })).toBe('pending');
    expect(lessonState({ ...standard, status: 'pending_payment' })).toBe('pending');
  });

  it('marks an offer that came from a gap', () => {
    expect(lessonState({ ...standard, source: 'gap_fill' })).toBe('gap-fill');
    // Once it has been taught it is a lesson like any other.
    expect(lessonState({ ...standard, source: 'gap_fill', status: 'completed', paymentStatus: 'paid_cash' })).toBe('paid');
  });

  it('says completed for one that is done and not paid for', () => {
    expect(lessonState({ ...standard, status: 'completed' })).toBe('completed');
  });

  it('says how a lesson paid in person was paid (PAY-05)', () => {
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_cash' })).toBe('Paid (cash)');
    expect(lessonStateLabel({ ...standard, status: 'completed', paymentStatus: 'paid_bank' })).toBe('Paid (bank)');
    // A card, credit, or anything that is not paid keeps the pill's usual word.
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_card' })).toBeUndefined();
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_credit' })).toBeUndefined();
    expect(lessonStateLabel(standard)).toBeUndefined();
    // A cancelled lesson is cancelled, whatever paid for it.
    expect(lessonStateLabel({ ...standard, status: 'cancelled', paymentStatus: 'paid_cash' })).toBeUndefined();
  });
});

describe('the shape of a day (DIA-03, M1-19)', () => {
  const open = new Date('2026-09-15T08:00:00Z');
  const close = new Date('2026-09-15T18:00:00Z');

  it('finds the gaps worth filling, and ignores the short ones', () => {
    const day = [
      lesson('2026-09-15T08:00:00Z', '2026-09-15T09:00:00Z'),
      lesson('2026-09-15T09:30:00Z', '2026-09-15T10:30:00Z'),
      lesson('2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z'),
    ];

    expect(gapsBetween(day, open, close)).toEqual([
      { startsAt: new Date('2026-09-15T10:30:00Z'), endsAt: new Date('2026-09-15T14:00:00Z'), minutes: 210 },
      { startsAt: new Date('2026-09-15T15:00:00Z'), endsAt: close, minutes: 180 },
    ]);
  });

  it('counts a cancelled lesson as free time', () => {
    const day = [lesson('2026-09-15T09:00:00Z', '2026-09-15T17:00:00Z', { status: 'cancelled' })];

    expect(gapsBetween(day, open, close)).toEqual([{ startsAt: open, endsAt: close, minutes: 600 }]);
    expect(teachingMinutes(day)).toBe(0);
  });

  it('adds up what is actually being taught', () => {
    const day = [
      lesson('2026-09-15T08:00:00Z', '2026-09-15T09:30:00Z'),
      lesson('2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z'),
      lesson('2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z', { status: 'no_show' }),
    ];

    expect(teachingMinutes(day)).toBe(150);
  });

  it('groups lessons by the day they start on, in order', () => {
    const days = byDay(
      [
        lesson('2026-09-16T09:00:00Z', '2026-09-16T10:00:00Z'),
        lesson('2026-09-15T15:00:00Z', '2026-09-15T16:00:00Z'),
        lesson('2026-09-15T09:00:00Z', '2026-09-15T10:00:00Z'),
      ],
      (instant) => instant.toISOString().slice(0, 10),
    );

    expect([...days.keys()]).toEqual(['2026-09-15', '2026-09-16']);
    expect(days.get('2026-09-15')).toHaveLength(2);
    expect(days.get('2026-09-15')?.[0]?.startsAt.getUTCHours()).toBe(9);
  });
});
