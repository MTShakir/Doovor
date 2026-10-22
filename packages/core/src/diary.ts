/**
 * Reading a diary: what a lesson is, what state it is in, and how a day is laid out
 * (DIA-03, DIA-04, M1-19).
 *
 * The database holds several facts about a lesson: whether it is confirmed, whether it has
 * been paid for, how, and what kind of lesson it is. A person glancing at their phone at
 * seven in the morning wants one word per lesson. This decides which word.
 */

import type { LocalDate } from './time/calendar.ts';

export type BookingStatus =
  | 'pending_payment'
  | 'requested'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'declined'
  | 'expired';

export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid_card'
  | 'paid_cash'
  | 'paid_bank'
  | 'paid_credit'
  | 'refunded'
  | 'partially_refunded'
  | 'failed';

/** The words the design system has pills for. */
export type LessonState = 'test-day' | 'cancelled' | 'pending' | 'completed' | 'credit' | 'paid' | 'unpaid' | 'gap-fill';

export interface LessonFacts {
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  /** The kind of lesson, from the catalogue. */
  kind: string;
  source?: string;
  /** Minutes of it paid for from credit (D-225). Zero or absent for a lesson that used none. */
  creditMinutes?: number;
  /**
   * A request the instructor turned down. Its status is cancelled, as every rule about lessons
   * that are off needs it to be, and this is how its pill tells the two apart (D-340).
   */
  declined?: boolean;
}

/**
 * One word for a lesson (DIA-04). Order matters: a test day is a test day whatever else is
 * true of it, a lesson that is off is off, and money only matters once it is going ahead.
 */
export function lessonState(facts: LessonFacts): LessonState {
  if (facts.status === 'cancelled' || facts.status === 'no_show' || facts.status === 'declined' || facts.status === 'expired') {
    return 'cancelled';
  }
  if (facts.kind === 'test_day') return 'test-day';
  if (facts.status === 'requested' || facts.status === 'pending_payment') return 'pending';
  if (facts.source === 'gap_fill' && facts.status !== 'completed') return 'gap-fill';
  if (facts.paymentStatus === 'paid_credit') return 'credit';
  if (facts.paymentStatus.startsWith('paid_')) return 'paid';
  if (facts.status === 'completed') return 'completed';
  return 'unpaid';
}

/**
 * The pill's own words, where one word is not enough: how a lesson was paid in person
 * (PAY-05). Undefined when the pill's usual word says it all.
 */
export function lessonStateLabel(facts: LessonFacts): string | undefined {
  // Off like a cancellation, but nobody called it off: nobody came (R-09).
  if (facts.status === 'no_show') return 'No-show';
  // A request the instructor turned down, and one nobody answered or paid for in time, were never
  // booked, so neither was cancelled (BOK-06, R-12, D-336, D-340).
  if (facts.status === 'declined' || (facts.status === 'cancelled' && facts.declined === true)) return 'Declined';
  if (facts.status === 'expired') return 'Expired';
  // Asked for and not answered yet: not booked, whatever the card has done (BOK-06, D-377).
  if (facts.status === 'requested') return 'Requested';
  if (lessonState(facts) !== 'paid') return undefined;
  // Part of it came from credit and the rest was paid, so the pill says both. "Paid (cash)" on a
  // lesson an hour of credit went into is not what happened (D-225). Every method names itself,
  // card included: a bare "Paid" next to "Paid (cash)" only told you what it was not (D-233).
  const alsoCredit = (facts.creditMinutes ?? 0) > 0;
  if (facts.paymentStatus === 'paid_cash') return alsoCredit ? 'Paid (credit + cash)' : 'Paid (cash)';
  if (facts.paymentStatus === 'paid_bank') return alsoCredit ? 'Paid (credit + bank)' : 'Paid (bank)';
  if (facts.paymentStatus === 'paid_card') return alsoCredit ? 'Paid (credit + card)' : 'Paid (card)';
  // Credit alone never gets here: `lessonState` calls it 'credit' and that pill says so itself.
  return undefined;
}

/** A lesson that no longer takes up room in the day. */
export function isOff(status: BookingStatus): boolean {
  return status === 'cancelled' || status === 'declined' || status === 'expired' || status === 'no_show';
}

/** R-09: the earliest a no-show may be recorded, counted from when the lesson was due to start (D-228). */
export const noShowAfterMinutes = 30;

/** What an instructor may say about a lesson right now. */
export interface LessonAnswers {
  /** It has not started: it can be moved or called off. */
  move: boolean;
  /** Its time is up: it can be marked as taught, or as nobody came. */
  mark: boolean;
  /** And long enough has passed since it was due to start to call it a no-show (R-09). */
  noShow: boolean;
}

const nothingToSay: LessonAnswers = { move: false, mark: false, noShow: false };

/**
 * What a lesson can be marked as at a given moment (BOK-10, R-09, D-213).
 *
 * The clock decides, not the card. A lesson that is running is one an instructor is in the
 * middle of teaching: asking how it went while they are still teaching it is how a lesson gets
 * marked done an hour early, so the answers only appear once its time is up. The same clock takes
 * moving and calling off away the moment it starts, because neither means anything by then.
 *
 * A lesson that is off, already marked, or still only asked for has nothing to say either way.
 */
export function lessonAnswers(lesson: { startsAt: Date; endsAt: Date; facts: LessonFacts }, now: Date): LessonAnswers {
  const { status } = lesson.facts;
  if (isOff(status) || status === 'completed' || status === 'requested') return nothingToSay;
  const at = now.getTime();
  const mark = lesson.endsAt.getTime() <= at;
  return {
    move: at < lesson.startsAt.getTime(),
    mark,
    // Nobody came is not a verdict on how the lesson went, so it does not wait for the end the way
    // Done does (D-213): half an hour of standing on a doorstep is the whole of the evidence, and
    // an instructor who waits that long and drives off should be able to say so there and then
    // (R-09, D-228).
    noShow: at >= lesson.startsAt.getTime() + noShowAfterMinutes * 60_000,
  };
}

export interface DiaryLesson {
  id: string;
  startsAt: Date;
  endsAt: Date;
  facts: LessonFacts;
}

export interface DiaryGap {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
}

/**
 * The gaps between one lesson and the next, inside the hours worked. Long enough to be worth
 * filling, which is what Gap Fill offers later (BOK-09); shorter ones are travel and lunch.
 */
export function gapsBetween(lessons: DiaryLesson[], dayStart: Date, dayEnd: Date, leastMinutes = 60): DiaryGap[] {
  const closes = dayEnd.getTime();
  const busy = lessons
    .filter((lesson) => !isOff(lesson.facts.status))
    .map((lesson) => ({ from: lesson.startsAt.getTime(), to: lesson.endsAt.getTime() }))
    .sort((a, b) => a.from - b.from);

  const spans: { from: number; to: number }[] = [];
  let cursor = dayStart.getTime();
  for (const lesson of busy) {
    if (lesson.from > cursor) spans.push({ from: cursor, to: Math.min(lesson.from, closes) });
    cursor = Math.max(cursor, lesson.to);
  }
  if (cursor < closes) spans.push({ from: cursor, to: closes });

  return spans
    .map((span) => ({
      startsAt: new Date(span.from),
      endsAt: new Date(span.to),
      minutes: Math.round((span.to - span.from) / 60_000),
    }))
    .filter((gap) => gap.minutes >= leastMinutes);
}

/** Minutes taught in a day, ignoring anything that is off. */
export function teachingMinutes(lessons: DiaryLesson[]): number {
  return lessons
    .filter((lesson) => !isOff(lesson.facts.status))
    .reduce((total, lesson) => total + Math.round((lesson.endsAt.getTime() - lesson.startsAt.getTime()) / 60_000), 0);
}

export interface DiaryDay {
  date: LocalDate;
  lessons: DiaryLesson[];
}

/** Groups lessons by the local day they start on, for the week and month views. */
export function byDay<T extends DiaryLesson>(lessons: T[], dayOf: (instant: Date) => LocalDate): Map<LocalDate, T[]> {
  const days = new Map<LocalDate, T[]>();
  for (const lesson of [...lessons].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const day = dayOf(lesson.startsAt);
    const existing = days.get(day);
    if (existing) existing.push(lesson);
    else days.set(day, [lesson]);
  }
  return days;
}

/** A stretch of time somebody is taken: a lesson, or time off (D-284). */
export interface BusyStretch {
  kind: 'lesson' | 'away';
  startsAt: Date;
  endsAt: Date;
}

/** A busy stretch cut to the day shown: a week away is all of that day, not a time to read. */
export interface BusyPart extends BusyStretch {
  allDay: boolean;
}

/** The busy stretches that touch a day, cut to it, in time order. */
export function busyOnDay(busy: BusyStretch[], day: { startsAt: Date; endsAt: Date }): BusyPart[] {
  return busy
    .map((stretch) => {
      const startsAt = stretch.startsAt < day.startsAt ? day.startsAt : stretch.startsAt;
      const endsAt = stretch.endsAt > day.endsAt ? day.endsAt : stretch.endsAt;
      return { kind: stretch.kind, startsAt, endsAt, allDay: startsAt <= day.startsAt && endsAt >= day.endsAt };
    })
    .filter((part) => part.endsAt > part.startsAt)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** The minutes taken, counting a lesson during time off once. */
export function minutesTaken(busy: BusyStretch[]): number {
  let minutes = 0;
  let reached = Number.NEGATIVE_INFINITY;
  for (const stretch of [...busy].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const from = Math.max(stretch.startsAt.getTime(), reached);
    const to = stretch.endsAt.getTime();
    if (to > from) minutes += (to - from) / 60_000;
    reached = Math.max(reached, to);
  }
  return Math.round(minutes);
}
