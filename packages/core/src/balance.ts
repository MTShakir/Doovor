/**
 * What a learner has with a Business, and what they owe it (PAY-06, M3-16).
 *
 * The learner's Payments screen and the instructor's learner card show the same thing, worked
 * out here from the same facts, so the two can never disagree: credit to book with, the lessons
 * that are owed for and which of those are overdue, and what has happened to their money.
 */

import type { LedgerKind } from './credit.ts';
import type { BookingStatus, PaymentStatus } from './diary.ts';
import { formatPence } from './money.ts';
import { formatDate, formatMinutes } from './time/format.ts';

export type PaymentMode = 'at_booking' | 'before_lesson' | 'after_lesson' | 'credit' | 'offline';

export interface MoneyLesson {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode;
  pricePence: number;
}

/** How long money can be owed before it is overdue, and shown in red (D-090). */
export const OVERDUE_AFTER_HOURS = 48;

const HOUR = 3_600_000;

/**
 * When a lesson's money was due, on the terms it was booked on (PAY-03). Null for a lesson that
 * nothing is owed for: paid, free, not going ahead, or still a request or a hold for a card.
 */
export function moneyDueAt(lesson: MoneyLesson): Date | null {
  if (lesson.status !== 'confirmed' && lesson.status !== 'in_progress' && lesson.status !== 'completed') return null;
  if (lesson.paymentStatus !== 'unpaid' && lesson.paymentStatus !== 'pending' && lesson.paymentStatus !== 'failed') return null;
  if (lesson.pricePence <= 0 || lesson.paymentMode === 'credit') return null;

  switch (lesson.paymentMode) {
    // Charged the day before, so a charge that has not happened by then is owed from then.
    case 'before_lesson':
      return new Date(lesson.startsAt.getTime() - 24 * HOUR);
    // Asked for once it is done.
    case 'after_lesson':
      return lesson.endsAt;
    // Paid in person on the day, or at booking: owed once the lesson starts.
    default:
      return lesson.startsAt;
  }
}

export interface OwedLesson {
  lesson: MoneyLesson;
  dueAt: Date;
  /** Owed for longer than `OVERDUE_AFTER_HOURS`. */
  overdue: boolean;
}

/** The lessons owed for now, the longest owed first. */
export function owedLessons(lessons: readonly MoneyLesson[], now: Date): OwedLesson[] {
  const owed: OwedLesson[] = [];
  for (const lesson of lessons) {
    const dueAt = moneyDueAt(lesson);
    if (dueAt === null || dueAt.getTime() > now.getTime()) continue;
    owed.push({ lesson, dueAt, overdue: now.getTime() - dueAt.getTime() >= OVERDUE_AFTER_HOURS * HOUR });
  }
  return owed.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export interface BalanceSummary {
  /** Minutes of credit to book with (PAY-04). */
  creditMinutes: number;
  owedPence: number;
  /** The part of what is owed that is overdue. */
  overduePence: number;
  owed: OwedLesson[];
}

export function summariseBalance(input: { creditMinutes: number; lessons: readonly MoneyLesson[]; now: Date }): BalanceSummary {
  const owed = owedLessons(input.lessons, input.now);
  return {
    creditMinutes: Math.max(0, input.creditMinutes),
    owedPence: owed.reduce((sum, one) => sum + one.lesson.pricePence, 0),
    overduePence: owed.filter((one) => one.overdue).reduce((sum, one) => sum + one.lesson.pricePence, 0),
    owed,
  };
}

// ---------------------------------------------------------------------------------------
// History.
// ---------------------------------------------------------------------------------------

export type HistoryEntry =
  | {
      kind: 'payment';
      at: Date;
      amountPence: number;
      method: 'card' | 'cash' | 'bank' | 'credit';
      refundedPence: number;
      /** The lesson it paid for, when it paid for one. */
      lessonAt: Date | null;
      /** The minutes of credit it bought, when it bought a package. */
      creditMinutes: number | null;
    }
  | { kind: 'refund'; at: Date; amountPence: number; status: 'pending' | 'succeeded' | 'failed' | 'cancelled' }
  | { kind: 'credit'; at: Date; move: Exclude<LedgerKind, 'purchase'>; minutes: number; lessonAt: Date | null };

export interface HistoryLine {
  title: string;
  detail: string;
  /** Money that moved, when money did. */
  amount: string | null;
}

const methods: Record<'card' | 'cash' | 'bank' | 'credit', string> = {
  card: 'Card',
  cash: 'Cash',
  bank: 'Bank transfer',
  credit: 'Credit',
};

function lessonOn(at: Date | null): string {
  return at === null ? 'A lesson' : `Lesson on ${formatDate(at)}`;
}

/**
 * One line of history in words both people can read: nothing here says "you", because the
 * learner and their instructor see the same lines.
 */
export function historyLine(entry: HistoryEntry): HistoryLine {
  switch (entry.kind) {
    case 'payment': {
      const title =
        entry.creditMinutes !== null ? `${formatMinutes(entry.creditMinutes)} of credit bought` : lessonOn(entry.lessonAt);
      const refunded =
        entry.refundedPence <= 0
          ? ''
          : entry.refundedPence >= entry.amountPence
            ? ', refunded'
            : `, ${formatPence(entry.refundedPence)} refunded`;
      return { title, detail: `${methods[entry.method]}${refunded}`, amount: formatPence(entry.amountPence) };
    }
    case 'refund':
      return {
        title: 'Refund',
        detail:
          entry.status === 'succeeded'
            ? 'Paid back'
            : entry.status === 'pending'
              ? 'On its way back'
              : 'Could not be paid back',
        amount: formatPence(entry.amountPence),
      };
    case 'credit': {
      const minutes = formatMinutes(Math.abs(entry.minutes));
      const titles: Record<Exclude<LedgerKind, 'purchase'>, string> = {
        use: `${minutes} of credit used`,
        return: `${minutes} of credit back`,
        fee: `${minutes} of credit kept as a late fee`,
        expiry: `${minutes} of credit ran out`,
        refund: `${minutes} of credit refunded`,
        adjustment: entry.minutes > 0 ? `${minutes} of credit added` : `${minutes} of credit taken off`,
      };
      return {
        title: titles[entry.move],
        detail: entry.lessonAt === null ? 'Credit' : lessonOn(entry.lessonAt),
        amount: null,
      };
    }
  }
}
