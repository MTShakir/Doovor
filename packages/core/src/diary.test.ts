import { describe, expect, it } from 'vitest';
import {
  busyOnDay,
  byDay,
  gapsBetween,
  isOff,
  lessonAnswers,
  lessonState,
  lessonStateLabel,
  minutesTaken,
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

  it('says how a lesson was paid for, whichever way that was (PAY-05, D-233)', () => {
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_cash' })).toBe('Paid (cash)');
    expect(lessonStateLabel({ ...standard, status: 'completed', paymentStatus: 'paid_bank' })).toBe('Paid (bank)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_card' })).toBe('Paid (card)');
    // Credit on its own is not a payment method: that pill says Credit and comes from the state.
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_credit' })).toBeUndefined();
    expect(lessonStateLabel(standard)).toBeUndefined();
    // A cancelled lesson is cancelled, whatever paid for it.
    expect(lessonStateLabel({ ...standard, status: 'cancelled', paymentStatus: 'paid_cash' })).toBeUndefined();
  });

  it('calls a lesson nobody came to a no-show, not a cancellation (R-09)', () => {
    expect(lessonState({ ...standard, status: 'no_show' })).toBe('cancelled');
    expect(lessonStateLabel({ ...standard, status: 'no_show', paymentStatus: 'paid_card' })).toBe('No-show');
  });

  it('calls a request turned down declined, and one nobody answered in time expired (BOK-06, R-12, D-336)', () => {
    expect(lessonState({ ...standard, status: 'declined' })).toBe('cancelled');
    expect(lessonStateLabel({ ...standard, status: 'declined' })).toBe('Declined');
    expect(lessonStateLabel({ ...standard, status: 'expired' })).toBe('Expired');
  });

  it('knows a request turned down by its marker, its status being cancelled as every rule needs (D-340)', () => {
    const turnedDown = { ...standard, status: 'cancelled' as const, declined: true };
    expect(lessonState(turnedDown)).toBe('cancelled');
    expect(lessonStateLabel(turnedDown)).toBe('Declined');
    // A lesson somebody called off is still cancelled, marker or none.
    expect(lessonStateLabel({ ...standard, status: 'cancelled' })).toBeUndefined();
    expect(lessonStateLabel({ ...standard, status: 'cancelled', declined: false })).toBeUndefined();
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

describe('what a lesson can be marked as, and when (BOK-10, R-09, D-213)', () => {
  // An hour's lesson, two in the afternoon.
  const at = (time: string) => new Date(`2026-09-15T${time}:00Z`);
  const hour = lesson('2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z');

  it('offers moving it and nothing else before it starts', () => {
    expect(lessonAnswers(hour, at('13:59'))).toEqual({ move: true, mark: false, noShow: false });
  });

  it('says nothing at all for the first half hour it is being taught', () => {
    // The fault this fixes: Done appeared the minute a lesson began, so an instructor could mark
    // it taught an hour before it was, from the card, by accident.
    for (const time of ['14:00', '14:15', '14:29']) {
      expect(lessonAnswers(hour, at(time))).toEqual({ move: false, mark: false, noShow: false });
    }
  });

  it('offers No show at half past, while Done still waits for the end (R-09, D-228)', () => {
    // An instructor stood on a doorstep for half an hour says so there and then; how the lesson
    // went is still not a question, because it has not happened.
    for (const time of ['14:30', '14:59']) {
      expect(lessonAnswers(hour, at(time))).toEqual({ move: false, mark: false, noShow: true });
    }
  });

  it('offers Done and No show the moment its time is up', () => {
    expect(lessonAnswers(hour, at('15:00'))).toEqual({ move: false, mark: true, noShow: true });
    expect(lessonAnswers(hour, at('18:00'))).toEqual({ move: false, mark: true, noShow: true });
  });

  it('keeps R-09 for a lesson short enough to end inside the half hour', () => {
    const short = lesson('2026-09-15T14:00:00Z', '2026-09-15T14:10:00Z');
    expect(lessonAnswers(short, at('14:10'))).toEqual({ move: false, mark: true, noShow: false });
    expect(lessonAnswers(short, at('14:29'))).toEqual({ move: false, mark: true, noShow: false });
    expect(lessonAnswers(short, at('14:30'))).toEqual({ move: false, mark: true, noShow: true });
  });

  it('has nothing to say about one that is off, already marked, or only asked for', () => {
    for (const status of ['cancelled', 'no_show', 'completed', 'declined', 'expired', 'requested'] as const) {
      expect(lessonAnswers(lesson('2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z', { status }), at('18:00'))).toEqual({
        move: false,
        mark: false,
        noShow: false,
      });
    }
  });
});

describe('a lesson paid two ways says both (D-225)', () => {
  it('names the credit and what paid the rest', () => {
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_cash', creditMinutes: 60 })).toBe('Paid (credit + cash)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_bank', creditMinutes: 30 })).toBe('Paid (credit + bank)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_card', creditMinutes: 45 })).toBe('Paid (credit + card)');
  });

  it('says what it always said when no credit went near it', () => {
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_cash' })).toBe('Paid (cash)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_cash', creditMinutes: 0 })).toBe('Paid (cash)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_bank' })).toBe('Paid (bank)');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'paid_card' })).toBe('Paid (card)');
  });

  it('still says no-show whatever paid for it', () => {
    expect(lessonStateLabel({ ...standard, status: 'no_show', paymentStatus: 'paid_cash', creditMinutes: 60 })).toBe('No-show');
  });

  it('is one word while the rest is still owed, because it is not paid yet', () => {
    expect(lessonState({ ...standard, paymentStatus: 'unpaid', creditMinutes: 60 })).toBe('unpaid');
    expect(lessonStateLabel({ ...standard, paymentStatus: 'unpaid', creditMinutes: 60 })).toBeUndefined();
  });
});

describe('when a linked instructor is taken, for the school (M9-08, D-284)', () => {
  // Tue 20 Oct 2026, in London: British Summer Time, an hour ahead of UTC.
  const day = { startsAt: new Date('2026-10-19T23:00:00Z'), endsAt: new Date('2026-10-20T23:00:00Z') };
  const at = (time: string) => new Date(`2026-10-20T${time}:00Z`);

  it('cuts what runs past the day to the day, and leaves out what misses it', () => {
    const parts = busyOnDay(
      [
        { kind: 'away', startsAt: at('13:00'), endsAt: new Date('2026-10-23T12:00:00Z') },
        { kind: 'lesson', startsAt: at('09:00'), endsAt: at('10:00') },
        { kind: 'lesson', startsAt: new Date('2026-10-19T09:00:00Z'), endsAt: new Date('2026-10-19T10:00:00Z') },
      ],
      day,
    );
    expect(parts).toEqual([
      { kind: 'lesson', startsAt: at('09:00'), endsAt: at('10:00'), allDay: false },
      { kind: 'away', startsAt: at('13:00'), endsAt: day.endsAt, allDay: false },
    ]);
  });

  it('says a week away is all of the day', () => {
    const [part] = busyOnDay([{ kind: 'away', startsAt: new Date('2026-10-18T08:00:00Z'), endsAt: new Date('2026-10-25T08:00:00Z') }], day);
    expect(part).toEqual({ kind: 'away', startsAt: day.startsAt, endsAt: day.endsAt, allDay: true });
  });

  it('counts a lesson during time off once', () => {
    expect(
      minutesTaken([
        { kind: 'away', startsAt: at('12:00'), endsAt: at('16:00') },
        { kind: 'lesson', startsAt: at('13:00'), endsAt: at('14:00') },
        { kind: 'lesson', startsAt: at('09:00'), endsAt: at('10:30') },
      ]),
    ).toBe(330);
    expect(minutesTaken([])).toBe(0);
  });
});
