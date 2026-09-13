/**
 * What happens when a lesson is called off (R-06 to R-09, M2-21).
 *
 * Three things decide it: who cancelled, how long before the lesson, and how it was paid
 * for. The money itself moves in M3; this is the decision, in one place, so the screen that
 * warns somebody and the transaction that charges them cannot disagree.
 */

export type CancelActor = 'learner' | 'instructor' | 'business' | 'system';

export type PaidWith = 'none' | 'card' | 'cash' | 'bank' | 'credit';

export interface CancellationInput {
  startsAt: Date;
  now: Date;
  by: CancelActor;
  /** Free cancellation up to this long before the lesson (R-06). */
  windowHours: number;
  /** What a late cancellation costs, as a percentage of the lesson (0, 50 or 100). */
  lateFeePercent: number;
  pricePence: number;
  paidWith: PaidWith;
  /** Minutes of credit the lesson was paid with, when it was (R-07). */
  creditMinutes?: number;
}

export interface CancellationOutcome {
  /** Inside the window the Business set, so the fee applies. */
  late: boolean;
  feePence: number;
  /** What goes back to the card or the bank. */
  refundPence: number;
  /** Minutes of credit that go back to the learner (R-07). */
  creditReturnedMinutes: number;
  /** An instructor calling a lesson off has to say why (R-08). */
  reasonRequired: boolean;
}

const HOUR = 3_600_000;

/** Money the learner has actually handed over, which is the only money there is to keep. */
function paidPence(input: CancellationInput): number {
  return input.paidWith === 'card' || input.paidWith === 'cash' || input.paidWith === 'bank' ? input.pricePence : 0;
}

/** True when the lesson is inside the free cancellation window (R-06). */
export function isLateCancellation(startsAt: Date, now: Date, windowHours: number): boolean {
  return startsAt.getTime() - now.getTime() < Math.max(0, windowHours) * HOUR;
}

/**
 * What a cancellation costs and returns. An instructor or the Business calling a lesson off
 * never costs the learner anything, whenever it happens (R-08).
 */
export function cancellationOutcome(input: CancellationInput): CancellationOutcome {
  const byThem = input.by === 'instructor' || input.by === 'business' || input.by === 'system';
  const late = isLateCancellation(input.startsAt, input.now, input.windowHours);
  const credit = input.paidWith === 'credit' ? Math.max(0, input.creditMinutes ?? 0) : 0;

  if (byThem || !late) {
    return {
      late,
      feePence: 0,
      refundPence: paidPence(input),
      creditReturnedMinutes: credit,
      reasonRequired: input.by === 'instructor' || input.by === 'business',
    };
  }

  const percent = Math.min(100, Math.max(0, input.lateFeePercent));
  const feePence = Math.round((input.pricePence * percent) / 100);

  return {
    late: true,
    feePence,
    refundPence: Math.max(0, paidPence(input) - feePence),
    // The credit pays the fee, so what comes back is the part the fee did not take (R-07).
    creditReturnedMinutes: Math.round((credit * (100 - percent)) / 100),
    reasonRequired: false,
  };
}

/** A lesson nobody turned up for counts as a late cancellation by the learner (R-09). */
export function noShowOutcome(input: Omit<CancellationInput, 'by'>): CancellationOutcome {
  const percent = Math.min(100, Math.max(0, input.lateFeePercent));
  const credit = input.paidWith === 'credit' ? Math.max(0, input.creditMinutes ?? 0) : 0;
  const feePence = Math.round((input.pricePence * percent) / 100);

  return {
    late: true,
    feePence,
    refundPence: Math.max(0, paidPence({ ...input, by: 'learner' }) - feePence),
    creditReturnedMinutes: Math.round((credit * (100 - percent)) / 100),
    reasonRequired: false,
  };
}

/** Fifteen minutes after the start, and not before (R-09). */
export const NO_SHOW_AFTER_MINUTES = 15;

export function canMarkNoShow(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime() + NO_SHOW_AFTER_MINUTES * 60_000;
}

/** How long a learner has to dispute a no-show (R-09). */
export const DISPUTE_DAYS = 7;

/** What the screen says before somebody presses cancel. */
export function cancellationWarning(outcome: CancellationOutcome, formatMoney: (pence: number) => string): string {
  if (!outcome.late) return 'No charge: this is inside the free cancellation window.';
  if (outcome.feePence === 0) return 'This is a late cancellation, but there is no fee.';
  return `This is a late cancellation, so ${formatMoney(outcome.feePence)} is charged.`;
}
