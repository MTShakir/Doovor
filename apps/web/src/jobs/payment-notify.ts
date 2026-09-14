import 'server-only';
import { periodInstants } from '@repo/core/money-periods';
import { notificationCatalogue } from '@repo/core/notifications';
import { addDaysToLocalDate, todayInZone } from '@repo/core/time';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows, peopleInvolved, rowContextFor, type BookingNotice } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';
import {
  peopleToTellAboutPayment,
  planCreditLow,
  planDailySummary,
  planOverdue,
  planPaymentReceived,
  type CreditNotice,
  type OverdueLesson,
  type PaymentNotice,
  type PaymentSummary,
} from './payment-notices';

/**
 * Telling people about money (NTF-03, M3-22, PRD Appendix B).
 *
 * A job is nobody: it reads through `system_*` functions and never touches a tenant table on
 * anybody's behalf. Who hears what is decided in `payment-notices.ts`, and every notification
 * carries a key of its own, so running any of these again writes nothing twice.
 */

export type PaymentNoticeResult =
  | NotifyResult
  /** Money marked paid in person, which can still be taken back out until then (D-089). */
  | { written: 0; waitUntil: string };

/** A payment received: the learner and the instructor are told (M3-22). */
export async function notifyAboutPayment(paymentId: string): Promise<PaymentNoticeResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_payment_notice', { p_payment_id: paymentId });
  if (error) throw new Error(`Could not read the payment to notify about it: ${error.message}`);
  // No such payment, one not received, or cash taken back out while it could be.
  if (data === null) return { written: 0 };

  const answer = data as unknown as PaymentNotice | { wait_until: string };
  if ('wait_until' in answer) return { written: 0, waitUntil: answer.wait_until };

  const muted = await mutedChannels(peopleToTellAboutPayment(answer), notificationCatalogue['payment.received'].category);
  const planned = planPaymentReceived(answer, muted);
  return {
    written: await writeNotifications(
      notificationRows(planned, { businessId: answer.business_id, entityType: 'payment', entityId: answer.payment_id }),
    ),
  };
}

export interface OverdueSweepResult {
  /** Lessons and fees owed for two days, whether or not anybody has been told yet. */
  looked: number;
  /** Notifications written. Somebody already told about a lesson is not told again. */
  written: number;
}

/**
 * Lessons and fees owed for two days (M3-22): the learner, the instructor and the school are told,
 * once each. Once a day, in the morning: nobody needs chasing about money at three in the morning,
 * and a day either way makes no difference to something already two days late.
 */
export async function notifyOverdueLessons(): Promise<OverdueSweepResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_overdue_lessons');
  if (error) throw new Error(`Could not read the lessons owed: ${error.message}`);

  const overdue = (data ?? []) as unknown as OverdueLesson[];
  const lessons: { overdue: OverdueLesson; notice: BookingNotice }[] = [];
  for (const one of overdue) {
    const notice = await supabase.rpc('system_booking_notice', { p_booking_id: one.booking_id });
    if (notice.error) throw new Error(`Could not read the lesson owed for: ${notice.error.message}`);
    if (notice.data !== null) lessons.push({ overdue: one, notice: notice.data as unknown as BookingNotice });
  }
  if (lessons.length === 0) return { looked: overdue.length, written: 0 };

  const people = [...new Set(lessons.flatMap(({ notice }) => peopleInvolved(notice)))];
  const muted = await mutedChannels(people, notificationCatalogue['payment.overdue'].category);
  const rows = lessons.flatMap(({ overdue: one, notice }) => notificationRows(planOverdue(one, notice, muted), rowContextFor(notice)));
  return { looked: overdue.length, written: await writeNotifications(rows) };
}

/** Credit running low (M3-22): the learner and their instructor, with what is left by now. */
export async function notifyCreditLow(businessId: string, learnerId: string): Promise<NotifyResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_credit_notice', {
    p_business_id: businessId,
    p_learner_id: learnerId,
  });
  if (error) throw new Error(`Could not read the credit to notify about it: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as CreditNotice;
  const people = [notice.learner_user_id, ...(notice.instructor_user_id === null ? [] : [notice.instructor_user_id])];
  const muted = await mutedChannels(people, notificationCatalogue['credit.low'].category);
  const planned = planCreditLow(notice, muted);
  return {
    written: await writeNotifications(
      notificationRows(planned, { businessId: notice.business_id, entityType: 'credit_account', entityId: notice.account_id }),
    ),
  };
}

export interface DailySummaryResult {
  /** The day summed up, in London. */
  day: string;
  /** Schools that took a payment that day. */
  schools: number;
  written: number;
}

/**
 * Yesterday's payments, for each school's owners and managers (M3-22). Yesterday in London,
 * midnight to midnight, however long the day was when the clocks changed.
 */
export async function sendDailyPaymentSummaries(now: Date = new Date()): Promise<DailySummaryResult> {
  const day = addDaysToLocalDate(todayInZone(now), -1);
  const { from, to } = periodInstants({ from: day, to: day });

  const { data, error } = await getSupabaseServiceClient().rpc('system_daily_payment_summaries', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(`Could not sum up the day's payments: ${error.message}`);

  const summaries = (data ?? []) as unknown as PaymentSummary[];
  if (summaries.length === 0) return { day, schools: 0, written: 0 };

  const muted = await mutedChannels([...new Set(summaries.flatMap((summary) => summary.user_ids))], notificationCatalogue['payment.daily_summary'].category);
  const rows = summaries.flatMap((summary) =>
    notificationRows(planDailySummary(summary, day, muted), { businessId: summary.business_id, entityType: 'business', entityId: summary.business_id }),
  );
  return { day, schools: summaries.length, written: await writeNotifications(rows) };
}
