/**
 * Turning money that moved into the notifications it comes to (NTF-03, M3-22, PRD Appendix B).
 *
 * The database says who each one concerns; this decides what each person is told. Nothing here
 * talks to a database, so which audience hears about what is a unit test, as it is for lessons in
 * `booking-notices.ts`.
 */

import { formatPence } from '@repo/core/money';
import { planNotifications, type NotificationChannel, type PlannedNotification } from '@repo/core/notifications';
import { formatCalendarDate, formatDate, formatMinutes, formatTime, type LocalDate } from '@repo/core/time';
import type { BookingNotice } from './booking-notices';

function mutedFor(muted: Map<string, NotificationChannel[]> | undefined, userId: string): NotificationChannel[] | undefined {
  return muted?.get(userId);
}

// ---------------------------------------------------------------------------------------
// A payment received.
// ---------------------------------------------------------------------------------------

/** What `system_payment_notice` answers once there is something to tell. */
export interface PaymentNotice {
  payment_id: string;
  business_id: string;
  amount_pence: number;
  method: string;
  booking_id: string | null;
  starts_at: string | null;
  booking_status: string | null;
  fee_pence: number | null;
  credit_minutes: number | null;
  learner_user_id: string;
  learner_name: string;
  instructor_user_id: string | null;
  instructor_name: string | null;
  /** Whoever marked money paid in person. They did it, so they are not told it happened. */
  recorded_by: string | null;
}

const paidBy: Record<string, string> = { card: 'by card', cash: 'in cash', bank: 'by bank transfer', credit: 'with credit' };

/** Which fee a payment paid, if it paid one: the way its receipt decides it (M3-20). */
function feePaid(notice: PaymentNotice): string {
  const fee = notice.fee_pence ?? 0;
  if (fee <= 0 || notice.amount_pence > fee) return '';
  if (notice.booking_status === 'no_show') return ' as the no-show fee';
  return notice.booking_status === 'cancelled' ? ' as the late cancellation fee' : '';
}

/** "£42 by card", or "£380 for 10 hours of credit". */
function paymentDetail(notice: PaymentNotice): string {
  const amount = formatPence(notice.amount_pence);
  if (notice.credit_minutes !== null) return `${amount} for ${formatMinutes(notice.credit_minutes)} of credit`;
  return `${amount} ${paidBy[notice.method] ?? ''}${feePaid(notice)}`.replace(/\s+/g, ' ').trim();
}

/** Everybody a payment might reach, so their settings can be looked up in one go. */
export function peopleToTellAboutPayment(notice: PaymentNotice): string[] {
  return [...new Set([notice.learner_user_id, ...(notice.instructor_user_id === null ? [] : [notice.instructor_user_id])])];
}

/**
 * A payment received (Appendix B): the instructor is told, and the learner gets a line in their
 * inbox and on their phone. Not an email: their receipt is the email (M3-20). A school's owners
 * and managers hear about a day's payments together, in the next morning's summary. Whoever
 * marked money paid in person is not told what they have just done.
 */
export function planPaymentReceived(notice: PaymentNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  const startsAt = notice.starts_at === null ? null : new Date(notice.starts_at);
  const recipients = [
    {
      userId: notice.learner_user_id,
      audience: 'learner' as const,
      muted: mutedFor(muted, notice.learner_user_id),
      unavailable: ['email' as const],
    },
    ...(notice.instructor_user_id === null || notice.instructor_user_id === notice.learner_user_id
      ? []
      : [{ userId: notice.instructor_user_id, audience: 'instructor' as const, muted: mutedFor(muted, notice.instructor_user_id) }]),
  ].filter((recipient) => recipient.userId !== notice.recorded_by);

  return planNotifications({
    kind: 'payment.received',
    entityId: notice.payment_id,
    facts: {
      learnerName: notice.learner_name,
      instructorName: notice.instructor_name ?? undefined,
      when: startsAt === null ? undefined : `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
      detail: paymentDetail(notice),
    },
    recipients,
    linkFor: (audience) => (audience === 'learner' ? '/app/learner/payments' : `/app/instructor/learners/${notice.learner_user_id}`),
  });
}

// ---------------------------------------------------------------------------------------
// Owed for two days.
// ---------------------------------------------------------------------------------------

/** One lesson or fee from `system_overdue_lessons`. */
export interface OverdueLesson {
  booking_id: string;
  due_at: string;
  amount_pence: number;
  /** Booked to be paid in person: the learner is not chased for what is probably unmarked cash. */
  in_person: boolean;
}

/**
 * A lesson or fee owed for two days (Appendix B, "Payment failed or overdue"): the learner is
 * asked to pay, and the instructor and the school are told. Once, whatever happens next: the
 * version in the key is the word "overdue", not the lesson's version.
 */
export function planOverdue(overdue: OverdueLesson, notice: BookingNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  const startsAt = new Date(notice.starts_at);
  const since = `${formatPence(overdue.amount_pence)} has been owed since ${formatDate(new Date(overdue.due_at))}`;

  return planNotifications({
    kind: 'payment.overdue',
    entityId: notice.booking_id,
    version: 'overdue',
    facts: {
      learnerName: notice.learner_name,
      instructorName: notice.instructor_name,
      when: `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
      detail: overdue.in_person ? `${since}. If it was paid in person, mark it paid` : since,
      learnerDetail: `${since}. Pay it now`,
    },
    recipients: [
      ...(overdue.in_person
        ? []
        : [{ userId: notice.learner_user_id, audience: 'learner' as const, muted: mutedFor(muted, notice.learner_user_id) }]),
      { userId: notice.instructor_user_id, audience: 'instructor' as const, muted: mutedFor(muted, notice.instructor_user_id) },
      ...notice.school_user_ids.map((userId) => ({ userId, audience: 'school' as const, muted: mutedFor(muted, userId) })),
    ],
    linkFor: (audience) => {
      if (audience === 'learner') return `/app/learner/pay/${notice.booking_id}`;
      return audience === 'school' ? '/app/school/learners' : `/app/instructor/learners/${notice.learner_user_id}`;
    },
  });
}

// ---------------------------------------------------------------------------------------
// Credit running low.
// ---------------------------------------------------------------------------------------

/** What `system_credit_notice` answers. */
export interface CreditNotice {
  account_id: string;
  business_id: string;
  business_name: string;
  balance_minutes: number;
  latest_lot_id: string | null;
  learner_user_id: string;
  learner_name: string;
  instructor_user_id: string | null;
  instructor_name: string | null;
}

/** Appendix B's two hours. */
export const CREDIT_LOW_MINUTES = 120;

/**
 * Credit running low (Appendix B): the learner and their instructor, once for each package
 * bought, however often lessons move the balance around the line. Nothing when it has been topped
 * up again since.
 */
export function planCreditLow(notice: CreditNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  if (notice.balance_minutes > CREDIT_LOW_MINUTES) return [];
  const left = notice.balance_minutes === 0 ? 'No credit left' : `${formatMinutes(notice.balance_minutes)} of credit left`;

  const learner = planNotifications({
    kind: 'credit.low',
    entityId: notice.account_id,
    version: notice.latest_lot_id ?? 'none',
    facts: { learnerName: notice.learner_name, instructorName: notice.instructor_name ?? undefined, detail: `${left} with ${notice.business_name}` },
    recipients: [{ userId: notice.learner_user_id, audience: 'learner', muted: mutedFor(muted, notice.learner_user_id) }],
    linkFor: () => '/app/learner/payments',
  });
  const instructor =
    notice.instructor_user_id === null
      ? []
      : planNotifications({
          kind: 'credit.low',
          entityId: notice.account_id,
          version: notice.latest_lot_id ?? 'none',
          facts: { learnerName: notice.learner_name, detail: left },
          recipients: [{ userId: notice.instructor_user_id, audience: 'instructor', muted: mutedFor(muted, notice.instructor_user_id) }],
          linkFor: () => `/app/instructor/learners/${notice.learner_user_id}`,
        });
  return [...learner, ...instructor];
}

// ---------------------------------------------------------------------------------------
// A school's day.
// ---------------------------------------------------------------------------------------

/** One school's day, from `system_daily_payment_summaries`. */
export interface PaymentSummary {
  business_id: string;
  business_name: string;
  total_pence: number;
  count: number;
  user_ids: string[];
}

/**
 * The summary of one day's payments for a school's owners and managers (Appendix B), once for
 * each day. Sent the next morning rather than in the evening, so a payment made late is not left
 * out of every summary.
 */
export function planDailySummary(summary: PaymentSummary, day: LocalDate, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  const payments = summary.count === 1 ? '1 payment' : `${String(summary.count)} payments`;
  return planNotifications({
    kind: 'payment.daily_summary',
    entityId: summary.business_id,
    version: day,
    facts: {
      detail: `${formatPence(summary.total_pence)} from ${payments} on ${formatCalendarDate(day, { year: false })} at ${summary.business_name}`,
    },
    recipients: summary.user_ids.map((userId) => ({ userId, audience: 'school' as const, muted: mutedFor(muted, userId) })),
    linkFor: () => '/app/school/money',
  });
}
