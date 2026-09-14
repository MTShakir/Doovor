/**
 * What happens when a lesson is called off (R-06 to R-09, M2-21, M3-18).
 *
 * Three things decide it: who cancelled, how long before the lesson, and how it was paid
 * for. This is the decision, in one place, so the screen that warns somebody, the transaction
 * that keeps the fee and the email that explains it afterwards cannot disagree.
 */

import type { BookingStatus } from './diary.ts';
import { formatMinutes } from './time/format.ts';

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
  /**
   * Where the lesson stands. Only a lesson that is on can be cancelled late: a request nobody
   * has accepted, or a slot held while a card is found, costs nothing to let go. Left out, the
   * lesson is taken to be on.
   */
  status?: BookingStatus;
}

export interface CancellationOutcome {
  /** Inside the window the Business set, so the fee applies. */
  late: boolean;
  feePence: number;
  /** What goes back to the card, or is owed back for cash and bank transfers. */
  refundPence: number;
  /** Minutes of credit that go back to the learner (R-07). */
  creditReturnedMinutes: number;
  /** Minutes of credit kept as the fee: what the lesson used and does not give back (R-07). */
  creditKeptMinutes: number;
  /** An instructor calling a lesson off has to say why (R-08). */
  reasonRequired: boolean;
  /** How it was paid for, which decides where anything that goes back goes (PAY-09). */
  paidWith: PaidWith;
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
  const on = input.status === undefined || input.status === 'confirmed' || input.status === 'in_progress';
  const late = on && isLateCancellation(input.startsAt, input.now, input.windowHours);
  const credit = input.paidWith === 'credit' ? Math.max(0, input.creditMinutes ?? 0) : 0;

  if (byThem || !late) {
    return {
      late,
      feePence: 0,
      refundPence: paidPence(input),
      creditReturnedMinutes: credit,
      creditKeptMinutes: 0,
      reasonRequired: input.by === 'instructor' || input.by === 'business',
      paidWith: input.paidWith,
    };
  }

  const percent = Math.min(100, Math.max(0, input.lateFeePercent));
  const feePence = Math.round((input.pricePence * percent) / 100);
  // The credit pays the fee, so what comes back is the part the fee did not take (R-07).
  const returned = Math.round((credit * (100 - percent)) / 100);

  return {
    late: true,
    feePence,
    refundPence: Math.max(0, paidPence(input) - feePence),
    creditReturnedMinutes: returned,
    creditKeptMinutes: credit - returned,
    reasonRequired: false,
    paidWith: input.paidWith,
  };
}

/** A lesson nobody turned up for counts as a late cancellation by the learner (R-09). */
export function noShowOutcome(input: Omit<CancellationInput, 'by'>): CancellationOutcome {
  const percent = Math.min(100, Math.max(0, input.lateFeePercent));
  const credit = input.paidWith === 'credit' ? Math.max(0, input.creditMinutes ?? 0) : 0;
  const feePence = Math.round((input.pricePence * percent) / 100);
  const returned = Math.round((credit * (100 - percent)) / 100);

  return {
    late: true,
    feePence,
    refundPence: Math.max(0, paidPence({ ...input, by: 'learner' }) - feePence),
    creditReturnedMinutes: returned,
    creditKeptMinutes: credit - returned,
    reasonRequired: false,
    paidWith: input.paidWith,
  };
}

/** Fifteen minutes after the start, and not before (R-09). */
export const NO_SHOW_AFTER_MINUTES = 15;

export function canMarkNoShow(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime() + NO_SHOW_AFTER_MINUTES * 60_000;
}

/** How long a learner has to dispute a no-show (R-09). */
export const DISPUTE_DAYS = 7;

type Money = (pence: number) => string;

/** Where money that is not kept goes: back to the card, or owed back in person. */
function goesBack(paidWith: PaidWith): string {
  return paidWith === 'card' ? 'goes back to your card' : 'is owed back to you';
}

/** What the screen says before somebody presses cancel. */
export function cancellationWarning(outcome: CancellationOutcome, formatMoney: Money): string {
  const back = outcome.refundPence > 0 ? `the ${formatMoney(outcome.refundPence)} you paid ${goesBack(outcome.paidWith)}` : null;

  if (!outcome.late) {
    if (outcome.creditReturnedMinutes > 0) return 'No charge: the credit it used comes back to you.';
    if (back !== null) return `No charge: ${back}.`;
    return 'No charge: this is inside the free cancellation window.';
  }
  // A lesson paid with credit pays its fee with credit, never with money (R-07).
  if (outcome.creditKeptMinutes > 0) {
    return `This is a late cancellation, so ${formatMinutes(outcome.creditKeptMinutes)} of your credit is kept as the fee.`;
  }
  if (outcome.feePence === 0) {
    return back === null
      ? 'This is a late cancellation, but there is no fee.'
      : `This is a late cancellation, but there is no fee: ${back}.`;
  }
  // Money already paid pays the fee, and only the rest goes back (PAY-09).
  if (outcome.paidWith === 'card' || outcome.paidWith === 'cash' || outcome.paidWith === 'bank') {
    return outcome.refundPence > 0
      ? `This is a late cancellation, so ${formatMoney(outcome.feePence)} of what you paid is kept as the fee and ${formatMoney(outcome.refundPence)} ${goesBack(outcome.paidWith)}.`
      : `This is a late cancellation, so the ${formatMoney(outcome.feePence)} you paid is kept as the fee.`;
  }
  return `This is a late cancellation, so ${formatMoney(outcome.feePence)} is charged.`;
}

// ---------------------------------------------------------------------------------------
// Afterwards: what a cancellation did, for the people told about it (acceptance-04).
// ---------------------------------------------------------------------------------------

/** What happened to the money for a lesson with a fee: kept, given back, or still to pay. */
interface FeeMoney {
  feePence: number;
  /** Money already paid that was kept as the fee. */
  keptPence: number;
  cardRefundPence: number;
  /** Cash or a bank transfer owed back, to be handed back and marked so. */
  offlineRefundPence: number;
  creditReturnedMinutes: number;
  creditKeptMinutes: number;
  /** A fee nothing paid is being charged to the card the learner keeps with the Business (M3-19). */
  charging: boolean;
}

/** What `cancel_booking` did about money, as its event records it. */
export interface CancelledMoney extends FeeMoney {
  by: CancelActor;
  late: boolean;
  /** How long before the start it was cancelled, and the policy it was cancelled under. */
  policy: { minutesBefore: number; windowHours: number; lateFeePercent: number } | null;
}

/** What `mark_no_show` did about money, as its event records it (R-09, M3-19). */
export interface NoShowMoney extends FeeMoney {
  /** The percentage of the price the policy keeps, when the event said. */
  lateFeePercent: number | null;
}

/** Who is reading: the learner, or somebody at the Business, who is told the learner's name. */
export type CancelledReader = { kind: 'learner' } | { kind: 'business'; learnerName: string };

function share(percent: number): string {
  if (percent >= 100) return 'the full price';
  if (percent === 50) return 'half the price';
  return `${String(percent)}% of the price`;
}

function before(minutes: number): string {
  if (minutes < 0) return 'You cancelled after it had started';
  if (minutes < 1) return 'You cancelled less than a minute before it started';
  // Whole hours: "23 hours 59 minutes" is more than anybody wants to read.
  return `You cancelled ${formatMinutes(minutes >= 60 ? Math.floor(minutes / 60) * 60 : minutes)} before it started`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whether a fee was kept or is to be paid at all. */
function hasFee(money: FeeMoney): boolean {
  return money.feePence > 0 || money.creditKeptMinutes > 0;
}

/** What paid the fee, or what is still to pay it, as the end of a sentence. */
function feePhrase(money: FeeMoney, learner: boolean, formatMoney: Money): string {
  const your = learner ? 'your' : 'their';
  if (money.creditKeptMinutes > 0) {
    const back = money.creditReturnedMinutes > 0 ? ` and ${formatMinutes(money.creditReturnedMinutes)} is back` : '';
    return `${formatMinutes(money.creditKeptMinutes)} of ${your} credit is kept as the fee${back}`;
  }
  if (money.keptPence > 0) {
    const backToCard = money.cardRefundPence > 0 ? ` and ${formatMoney(money.cardRefundPence)} is going back to ${your} card` : '';
    const owedBack = money.offlineRefundPence > 0 ? ` and ${learner ? 'you are' : 'they are'} owed back ${formatMoney(money.offlineRefundPence)}` : '';
    return backToCard === '' && owedBack === ''
      ? `the ${formatMoney(money.keptPence)} ${learner ? 'you' : 'they'} paid is kept as the fee`
      : `${formatMoney(money.keptPence)} of what ${learner ? 'you' : 'they'} paid is kept as the fee${backToCard}${owedBack}`;
  }
  if (money.charging) return `the ${formatMoney(money.feePence)} fee is being charged to ${your} saved card`;
  return `a fee of ${formatMoney(money.feePence)} is owed`;
}

/** Everything that goes back when no fee is kept, one sentence each. */
function givenBack(money: FeeMoney, reader: CancelledReader, formatMoney: Money): string[] {
  const learner = reader.kind === 'learner';
  const name = reader.kind === 'business' ? reader.learnerName : '';
  const lines: string[] = [];
  if (money.cardRefundPence > 0) {
    lines.push(`${formatMoney(money.cardRefundPence)} is going back to ${learner ? 'your' : `${name}'s`} card.`);
  }
  if (money.offlineRefundPence > 0) {
    lines.push(
      learner
        ? `You are owed back the ${formatMoney(money.offlineRefundPence)} you paid.`
        : `${name} is owed back the ${formatMoney(money.offlineRefundPence)} they paid.`,
    );
  }
  if (money.creditReturnedMinutes > 0) {
    lines.push(`${formatMinutes(money.creditReturnedMinutes)} of credit is back${learner ? '' : ` with ${name}`}.`);
  }
  return lines;
}

/**
 * What a cancellation did about money, in whole sentences, for the person reading about it
 * afterwards. When a fee was kept the learner is told why: when they cancelled, the policy, and
 * what the fee came out of (acceptance-04). Otherwise they are told what comes back, and how.
 */
export function cancelledMoneyWords(money: CancelledMoney, reader: CancelledReader, formatMoney: Money): string[] {
  const learner = reader.kind === 'learner';

  if (money.by === 'learner' && money.late && hasFee(money)) {
    const kept = feePhrase(money, learner, formatMoney);
    if (reader.kind === 'business') return [`${reader.learnerName} cancelled late, so ${kept}.`];
    if (money.policy === null) return [`${capitalise(kept)}.`];
    const { minutesBefore, windowHours, lateFeePercent } = money.policy;
    return [
      `${before(minutesBefore)}.`,
      `Cancelling less than ${formatMinutes(windowHours * 60)} before a lesson costs ${share(lateFeePercent)}, so ${kept}.`,
    ];
  }

  const lines = givenBack(money, reader, formatMoney);
  if (lines.length === 0 && learner && money.by === 'learner') lines.push('There is no charge.');
  return lines;
}

/**
 * What marking a lesson as a no-show did about money (R-09, M3-19). Nobody coming counts as
 * cancelling late, so the learner is told that, and what paid the fee or is to pay it; the
 * Business is told what came of it.
 */
export function noShowMoneyWords(money: NoShowMoney, reader: CancelledReader, formatMoney: Money): string[] {
  const learner = reader.kind === 'learner';
  if (!hasFee(money)) {
    const lines = givenBack(money, reader, formatMoney);
    if (lines.length === 0 && learner) lines.push('There is no charge.');
    return lines;
  }

  const kept = feePhrase(money, learner, formatMoney);
  if (!learner || money.lateFeePercent === null) return [`${capitalise(kept)}.`];
  return [`Missing a lesson costs ${share(money.lateFeePercent)}, as cancelling late does, so ${kept}.`];
}
