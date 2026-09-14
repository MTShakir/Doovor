/**
 * Turning something that happened to a lesson into the notifications it comes to (NTF-03,
 * M2-27).
 *
 * The outbox says what changed and who it was about; this decides what each person is told.
 * It holds no database or job-runner code so the mapping is testable on its own, the way
 * `dispatch.ts` is; `notify.ts` wires it to the real ones.
 */

import {
  cancelledMoneyWords,
  disputeDecisionWords,
  noShowMoneyWords,
  type CancelActor,
  type CancelledMoney,
  type NoShowMoney,
} from '@repo/core/cancellation';
import { formatPence } from '@repo/core/money';
import {
  planNotifications,
  type NotificationChannel,
  type NotificationKind,
  type PlannedNotification,
} from '@repo/core/notifications';
import { formatDate, formatTime, utcToLocal } from '@repo/core/time';

/** What `system_booking_notice` answers. */
export interface BookingNotice {
  booking_id: string;
  business_id: string;
  status: string;
  version: number;
  starts_at: string;
  learner_user_id: string;
  learner_name: string;
  instructor_user_id: string;
  instructor_name: string;
  school_user_ids: string[];
  fee_pence?: number | null;
  price_pence?: number;
  /** How the lesson is paid for, and whether it is (PAY-03). */
  payment_mode?: string;
  payment_status?: string;
  late_cancellation?: boolean;
  cancel_reason?: string | null;
}

export interface BookingEvent {
  name: string;
  payload: Record<string, unknown>;
}

/**
 * Which notification an event comes to, if any. A lesson marked done is not news to anybody
 * until the lesson record is written (M4-12), so it comes to nothing here.
 */
export function kindForEvent(event: BookingEvent, notice: BookingNotice): NotificationKind | null {
  switch (event.name) {
    case 'booking.created': {
      const status = typeof event.payload.status === 'string' ? event.payload.status : notice.status;
      if (status === 'requested') return 'booking.requested';
      return status === 'confirmed' ? 'booking.confirmed' : null;
    }
    case 'booking.accepted':
    case 'booking.declined':
      return 'booking.answered';
    case 'booking.cancelled':
      return 'booking.cancelled';
    case 'booking.no_show':
      return 'booking.no_show';
    case 'booking.disputed':
      return 'booking.disputed';
    case 'booking.dispute_decided':
      return 'booking.dispute_decided';
    case 'booking.rescheduled':
      return 'booking.rescheduled';
    // A lesson paid for afterwards asks for the money when it is marked done (PAY-03, M3-10).
    case 'booking.completed':
      return notice.payment_mode === 'after_lesson' && notice.payment_status === 'unpaid' ? 'payment.requested' : null;
    // Only a charge made with nobody there: a card refused on screen is shown on screen (M3-09).
    case 'payment.charge_failed':
      return 'payment.failed';
    default:
      return null;
  }
}

/** Why a charge the day before did not go through, in words that suit both people reading it. */
const chargeFailures: Record<string, string> = {
  no_card: 'There was no card saved to charge.',
  expired_card: 'The saved card has run out.',
  declined: 'The card was refused.',
  authentication_required: 'The bank wants the card holder to confirm the payment.',
};

const actors: readonly CancelActor[] = ['learner', 'instructor', 'business', 'system'];

function numberIn(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** What happened to a lesson's money, as the event that called it off or marked it records it. */
function feeMoney(event: BookingEvent, notice: BookingNotice) {
  const { payload } = event;
  return {
    feePence: numberIn(payload, 'fee_pence') ?? notice.fee_pence ?? 0,
    keptPence: numberIn(payload, 'kept_pence') ?? 0,
    cardRefundPence: numberIn(payload, 'card_refund_pence') ?? 0,
    offlineRefundPence: numberIn(payload, 'offline_refund_pence') ?? 0,
    creditReturnedMinutes: numberIn(payload, 'credit_returned_minutes') ?? 0,
    creditKeptMinutes: numberIn(payload, 'credit_kept_minutes') ?? 0,
    charging: payload.charging === true,
  };
}

/**
 * What a cancellation did about money, as its event records it (M3-18). An event written before
 * the event said all of this falls back on what the lesson says, and on saying less.
 */
function cancelledMoney(event: BookingEvent, notice: BookingNotice): CancelledMoney {
  const { payload } = event;
  const by = actors.find((actor) => actor === payload.by) ?? (notice.cancel_reason?.trim() ? 'instructor' : 'learner');
  const minutesBefore = numberIn(payload, 'minutes_before');
  const windowHours = numberIn(payload, 'window_hours');
  const lateFeePercent = numberIn(payload, 'fee_percent');
  return {
    ...feeMoney(event, notice),
    by,
    late: typeof payload.late === 'boolean' ? payload.late : notice.late_cancellation === true,
    policy:
      minutesBefore !== null && windowHours !== null && lateFeePercent !== null ? { minutesBefore, windowHours, lateFeePercent } : null,
  };
}

/** What marking a lesson as a no-show did about money, as its event records it (R-09, M3-19). */
function noShowMoney(event: BookingEvent, notice: BookingNotice): NoShowMoney {
  return { ...feeMoney(event, notice), lateFeePercent: numberIn(event.payload, 'fee_percent') };
}

/** Which fee a charge was for, by what became of the lesson. */
function feeName(notice: BookingNotice): string {
  return notice.status === 'no_show' ? 'no-show fee' : 'late cancellation fee';
}

/** Sentences one after another, each closed, so a reason typed without a full stop still reads right. */
function sentences(parts: (string | undefined)[]): string | undefined {
  const closed = parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .map((part) => (/[.?!]$/.test(part) ? part : `${part}.`));
  return closed.length === 0 ? undefined : closed.join(' ');
}

/** The line under the title, when there is more to say than when the lesson is. */
function detailFor(event: BookingEvent, notice: BookingNotice): string | undefined {
  if (event.name === 'booking.completed') {
    return notice.price_pence === undefined ? undefined : `${formatPence(notice.price_pence)} is due now.`;
  }
  if (event.name === 'payment.charge_failed') {
    const reason = typeof event.payload.reason === 'string' ? event.payload.reason : '';
    const why = chargeFailures[reason] ?? 'The card could not be charged.';
    // A fee, rather than a lesson charged the day before (PAY-09, M3-19).
    if (event.payload.fee === true && notice.fee_pence) {
      return sentences([`The ${formatPence(notice.fee_pence)} ${feeName(notice)} could not be charged`, why]);
    }
    return why;
  }
  const reason = notice.cancel_reason?.trim();
  if (event.name === 'booking.accepted') return 'It is in the diary';
  if (event.name === 'booking.declined') return reason ? `Reason: ${reason}` : 'They could not make that time';
  if (event.name === 'booking.cancelled') {
    const money = cancelledMoneyWords(cancelledMoney(event, notice), { kind: 'business', learnerName: notice.learner_name }, formatPence);
    return sentences([reason ? `Reason: ${reason}` : undefined, ...money]);
  }
  if (event.name === 'booking.no_show') {
    return sentences(noShowMoneyWords(noShowMoney(event, notice), { kind: 'business', learnerName: notice.learner_name }, formatPence));
  }
  return undefined;
}

/**
 * What only the learner is told: why a fee was kept, and where their money is going
 * (acceptance-04, acceptance-05). Everybody else reads `detailFor`.
 */
function learnerDetailFor(event: BookingEvent, notice: BookingNotice): string | undefined {
  if (event.name === 'booking.no_show') {
    const until = typeof event.payload.dispute_until === 'string' ? new Date(event.payload.dispute_until) : null;
    return sentences([
      ...noShowMoneyWords(noShowMoney(event, notice), { kind: 'learner' }, formatPence),
      // They can say it was wrong, for as long as R-09 gives them (M3-19).
      until === null || Number.isNaN(until.getTime())
        ? undefined
        : `If that is wrong, you can dispute it from your lessons until ${formatDate(until)}`,
    ]);
  }
  if (event.name === 'booking.dispute_decided') {
    const outcome = event.payload.outcome === 'kept' ? 'kept' : 'waived';
    return sentences(disputeDecisionWords({ ...feeMoney(event, notice), outcome }, formatPence));
  }
  // A fee that could not be charged is not a lesson to keep: it is money to pay (M3-19).
  if (event.name === 'payment.charge_failed' && event.payload.fee === true && notice.fee_pence) {
    const reason = typeof event.payload.reason === 'string' ? event.payload.reason : '';
    return sentences([
      `The ${formatPence(notice.fee_pence)} ${feeName(notice)} could not be charged to your saved card`,
      chargeFailures[reason] ?? 'The card could not be charged.',
      'Pay it now',
    ]);
  }
  if (event.name !== 'booking.cancelled') return undefined;
  const reason = notice.cancel_reason?.trim();
  const money = cancelledMoneyWords(cancelledMoney(event, notice), { kind: 'learner' }, formatPence);
  return sentences([reason ? `Reason: ${reason}` : undefined, ...money]);
}

/** Where each of them goes when they tap it. A learner who owes money goes where they pay it. */
function linkFor(event: BookingEvent, notice: BookingNotice): (audience: 'learner' | 'instructor' | 'school') => string {
  const day = utcToLocal(new Date(notice.starts_at)).date;
  return (audience) => {
    if (audience === 'learner') {
      return event.name === 'payment.charge_failed' || event.name === 'booking.completed'
        ? `/app/learner/pay/${notice.booking_id}`
        : '/app/learner/lessons';
    }
    // A dispute is decided where the learner's money is: their learner card.
    if (event.name === 'booking.disputed') {
      return audience === 'school' ? '/app/school/learners' : `/app/instructor/learners/${notice.learner_user_id}`;
    }
    if (audience === 'school') return `/app/school/diary?date=${day}`;
    return `/app/instructor/diary?view=day&date=${day}`;
  };
}

export interface BookingNoticeInput {
  event: BookingEvent;
  notice: BookingNotice;
  /** What each person has switched off for the category this kind belongs to (NTF-04). */
  muted?: Map<string, NotificationChannel[]>;
}

/** Everyone who hears about one change to one lesson, and what each of them is told. */
export function planBookingNotifications(input: BookingNoticeInput): PlannedNotification[] {
  const { event, notice } = input;
  const kind = kindForEvent(event, notice);
  if (kind === null) return [];

  const muted = input.muted ?? new Map<string, NotificationChannel[]>();
  const startsAt = new Date(notice.starts_at);

  return planNotifications({
    kind,
    entityId: notice.booking_id,
    version: notice.version,
    facts: {
      learnerName: notice.learner_name,
      instructorName: notice.instructor_name,
      when: `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
      detail: detailFor(event, notice),
      learnerDetail: learnerDetailFor(event, notice),
    },
    recipients: [
      { userId: notice.learner_user_id, audience: 'learner', muted: muted.get(notice.learner_user_id) },
      { userId: notice.instructor_user_id, audience: 'instructor', muted: muted.get(notice.instructor_user_id) },
      ...notice.school_user_ids.map((userId) => ({
        userId,
        audience: 'school' as const,
        muted: muted.get(userId),
      })),
    ],
    linkFor: linkFor(event, notice),
  });
}

/** Everybody one event might reach, so their settings can be looked up in one go. */
export function peopleInvolved(notice: BookingNotice): string[] {
  return [...new Set([notice.learner_user_id, notice.instructor_user_id, ...notice.school_user_ids])];
}

/** One row as `system_notify` takes it: plain JSON, because that is what crosses the wire. */
export type NotificationRow = Record<string, string | string[] | null>;

export interface RowContext {
  businessId: string;
  /** What it is about: a booking today, a payment later. */
  entityType: string;
  entityId: string;
}

/** The shape `system_notify` takes. */
export function notificationRows(planned: PlannedNotification[], context: RowContext): NotificationRow[] {
  return planned.map((one) => ({
    user_id: one.userId,
    business_id: context.businessId,
    kind: one.kind,
    category: one.category,
    title: one.title,
    body: one.body,
    link: one.link,
    channels: one.channels,
    entity_type: context.entityType,
    entity_id: context.entityId,
    dedupe_key: one.dedupeKey,
  }));
}

/** The context for one lesson's notifications. */
export function rowContextFor(notice: BookingNotice): RowContext {
  return { businessId: notice.business_id, entityType: 'booking', entityId: notice.booking_id };
}
