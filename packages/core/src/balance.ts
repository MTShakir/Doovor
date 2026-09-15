/**
 * What a learner has with a Business, and what they owe it (PAY-06, M3-16, M3-18).
 *
 * The learner's Payments screen and the instructor's learner card show the same thing, worked
 * out here from the same facts, so the two can never disagree: credit to book with, the lessons
 * that are owed for and which of those are overdue, money the Business owes back, and what has
 * happened to their money.
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
  /** The fee for calling it off late (R-06). Zero for a lesson that was not. */
  feePence: number;
  /** When it was called off, for a lesson that was. */
  cancelledAt: Date | null;
}

/** How long money can be owed before it is overdue, and shown in red (D-090). */
export const OVERDUE_AFTER_HOURS = 48;

const HOUR = 3_600_000;

/**
 * When a lesson's money was due, on the terms it was booked on (PAY-03). Null for a lesson that
 * nothing is owed for: paid, free, not going ahead, or still a request or a hold for a card.
 */
export function moneyDueAt(lesson: MoneyLesson): Date | null {
  // Called off late, or nobody came, with nobody having paid: the fee is owed from then
  // (PAY-09, R-09, M3-18, M3-19).
  if (lesson.status === 'cancelled' || lesson.status === 'no_show') {
    if (lesson.feePence <= 0) return null;
    if (lesson.paymentStatus !== 'unpaid' && lesson.paymentStatus !== 'failed') return null;
    return lesson.cancelledAt ?? lesson.startsAt;
  }
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

/** Which fee is owed for a lesson, if what is owed is a fee rather than the lesson. */
export type OwedFee = 'late_cancellation' | 'no_show';

function feeFor(lesson: MoneyLesson): OwedFee | null {
  if (lesson.status === 'cancelled') return 'late_cancellation';
  return lesson.status === 'no_show' ? 'no_show' : null;
}

/** What is owed for a lesson: the fee, for one called off late or nobody came to, and the price otherwise. */
export function amountOwedPence(lesson: MoneyLesson): number {
  return feeFor(lesson) === null ? lesson.pricePence : lesson.feePence;
}

export interface OwedLesson {
  lesson: MoneyLesson;
  dueAt: Date;
  /** Owed for longer than `OVERDUE_AFTER_HOURS`. */
  overdue: boolean;
  /** What is owed for it: a late cancellation fee is not the price of the lesson. */
  amountPence: number;
  /** Owed as a fee, for calling it off late or not coming, rather than for a lesson. */
  fee: OwedFee | null;
}

/** The lessons owed for now, the longest owed first. */
export function owedLessons(lessons: readonly MoneyLesson[], now: Date): OwedLesson[] {
  const owed: OwedLesson[] = [];
  for (const lesson of lessons) {
    const dueAt = moneyDueAt(lesson);
    if (dueAt === null || dueAt.getTime() > now.getTime()) continue;
    owed.push({
      lesson,
      dueAt,
      overdue: now.getTime() - dueAt.getTime() >= OVERDUE_AFTER_HOURS * HOUR,
      amountPence: amountOwedPence(lesson),
      fee: feeFor(lesson),
    });
  }
  return owed.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export type RefundKind = 'card' | 'offline' | 'credit';

export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface MoneyRefund {
  amountPence: number;
  status: RefundStatus;
  kind: RefundKind;
}

export interface BalanceSummary {
  /** Minutes of credit to book with (PAY-04). */
  creditMinutes: number;
  owedPence: number;
  /** The part of what is owed that is overdue. */
  overduePence: number;
  owed: OwedLesson[];
  /**
   * Cash or bank transfers the Business owes back and has not yet handed back, such as for a
   * lesson it called off (R-08, M3-18). A card refund goes back on its own, so it is not here.
   */
  owedBackPence: number;
}

export function summariseBalance(input: {
  creditMinutes: number;
  lessons: readonly MoneyLesson[];
  refunds?: readonly MoneyRefund[];
  now: Date;
}): BalanceSummary {
  const owed = owedLessons(input.lessons, input.now);
  return {
    creditMinutes: Math.max(0, input.creditMinutes),
    owedPence: owed.reduce((sum, one) => sum + one.amountPence, 0),
    overduePence: owed.filter((one) => one.overdue).reduce((sum, one) => sum + one.amountPence, 0),
    owed,
    owedBackPence: (input.refunds ?? [])
      .filter((refund) => refund.kind === 'offline' && refund.status === 'pending')
      .reduce((sum, refund) => sum + refund.amountPence, 0),
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
      /** Already on its way back to a card, or owed back in person (M3-18). */
      pendingRefundPence: number;
      /** Its receipt has been issued, so there is one to open (PAY-08). */
      hasReceipt: boolean;
      /** The lesson it paid for, when it paid for one. */
      lessonAt: Date | null;
      /** The minutes of credit it bought, when it bought a package. */
      creditMinutes: number | null;
    }
  | { kind: 'refund'; at: Date; amountPence: number; status: RefundStatus; refundKind: RefundKind }
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
              ? // Cash or a bank transfer goes back when somebody hands it back (M3-18).
                entry.refundKind === 'offline'
                ? 'Owed back'
                : 'On its way back'
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
