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

/** A lesson that no longer takes up room in the day. */
export function isOff(status: BookingStatus): boolean {
  return status === 'cancelled' || status === 'declined' || status === 'expired' || status === 'no_show';
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
export function byDay(lessons: DiaryLesson[], dayOf: (instant: Date) => LocalDate): Map<LocalDate, DiaryLesson[]> {
  const days = new Map<LocalDate, DiaryLesson[]>();
  for (const lesson of [...lessons].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const day = dayOf(lesson.startsAt);
    const existing = days.get(day);
    if (existing) existing.push(lesson);
    else days.set(day, [lesson]);
  }
  return days;
}
