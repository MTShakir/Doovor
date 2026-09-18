import 'server-only';
import { summariseBalance, type BalanceSummary, type HistoryEntry, type PaymentMode } from '@repo/core/balance';
import type { BookingStatus, PaymentStatus } from '@repo/core/diary';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A learner's balance with one Business (PAY-06, M3-16, M3-18), for the learner's Payments screen
 * and the instructor's learner card alike.
 *
 * The facts come from `learner_balance`, which reads everything for anybody allowed to see it,
 * and what is owed is worked out by packages/core/src/balance.ts. Both screens call this, so they
 * cannot say different things.
 */

const iso = z.string().transform((value) => new Date(value));

// The function answers JSON, so it is read the way any input is.
const factsSchema = z.object({
  credit_minutes: z.number().int(),
  lessons: z.array(
    z.object({
      id: z.string(),
      starts_at: iso,
      ends_at: iso,
      status: z.string(),
      payment_status: z.string(),
      payment_mode: z.string(),
      price_pence: z.number().int(),
      fee_pence: z.number().int(),
      cancelled_at: iso.nullable(),
      instructor_id: z.string(),
      instructor_name: z.string(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      at: iso,
      amount_pence: z.number().int(),
      method: z.enum(['card', 'cash', 'bank', 'credit']),
      refunded_pence: z.number().int(),
      pending_refund_pence: z.number().int(),
      has_receipt: z.boolean(),
      lesson_at: iso.nullable(),
      credit_minutes: z.number().int().nullable(),
    }),
  ),
  refunds: z.array(
    z.object({
      id: z.string(),
      at: iso,
      amount_pence: z.number().int(),
      status: z.enum(['pending', 'succeeded', 'failed', 'cancelled']),
      kind: z.enum(['card', 'offline', 'credit']),
      lesson_at: iso.nullable(),
      instructor_id: z.string().nullable(),
    }),
  ),
  credit: z.array(
    z.object({
      id: z.string(),
      at: iso,
      move: z.enum(['use', 'return', 'fee', 'expiry', 'adjustment', 'refund']),
      minutes: z.number().int(),
      lesson_at: iso.nullable(),
    }),
  ),
});

export type BalanceHistoryEntry = HistoryEntry & { id: string };

export interface LessonInstructor {
  id: string;
  name: string;
}

/** Cash or a bank transfer the Business owes back, until somebody marks it handed back (M3-18). */
export interface OwedBack {
  refundId: string;
  at: Date;
  amountPence: number;
  /** The lesson it was paid for, when it was for one. */
  lessonAt: Date | null;
  /** Who taught that lesson, who may say it has been handed back. */
  instructorId: string | null;
}

export interface Balance extends BalanceSummary {
  /** Who each lesson that could be owed for is with. */
  instructors: Map<string, LessonInstructor>;
  /** Money owed back, the longest owed first. */
  owedBack: OwedBack[];
  /** Newest first. */
  history: BalanceHistoryEntry[];
}

/** How much history a screen shows: enough to answer "what was that?", no more. */
const HISTORY_LENGTH = 20;

/** Null when the caller may not see this learner's balance, or it could not be read. */
export async function learnerBalance(businessId: string, learnerId: string, now = new Date()): Promise<Balance | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_balance', { p_business_id: businessId, p_learner_id: learnerId });
  if (error) return null;

  const parsed = factsSchema.safeParse(data);
  if (!parsed.success) return null;
  const facts = parsed.data;

  const summary = summariseBalance({
    creditMinutes: facts.credit_minutes,
    lessons: facts.lessons.map((lesson) => ({
      id: lesson.id,
      startsAt: lesson.starts_at,
      endsAt: lesson.ends_at,
      status: lesson.status as BookingStatus,
      paymentStatus: lesson.payment_status as PaymentStatus,
      paymentMode: lesson.payment_mode as PaymentMode,
      pricePence: lesson.price_pence,
      feePence: lesson.fee_pence,
      cancelledAt: lesson.cancelled_at,
    })),
    refunds: facts.refunds.map((refund) => ({ amountPence: refund.amount_pence, status: refund.status, kind: refund.kind })),
    now,
  });

  const history: BalanceHistoryEntry[] = [
    ...facts.payments.map((payment) => ({
      id: payment.id,
      kind: 'payment' as const,
      at: payment.at,
      amountPence: payment.amount_pence,
      method: payment.method,
      refundedPence: payment.refunded_pence,
      pendingRefundPence: payment.pending_refund_pence,
      hasReceipt: payment.has_receipt,
      lessonAt: payment.lesson_at,
      creditMinutes: payment.credit_minutes,
    })),
    ...facts.refunds.map((refund) => ({
      id: refund.id,
      kind: 'refund' as const,
      at: refund.at,
      amountPence: refund.amount_pence,
      status: refund.status,
      refundKind: refund.kind,
    })),
    ...facts.credit.map((move) => ({
      id: move.id,
      kind: 'credit' as const,
      at: move.at,
      move: move.move,
      minutes: move.minutes,
      lessonAt: move.lesson_at,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, HISTORY_LENGTH);

  return {
    ...summary,
    instructors: new Map(facts.lessons.map((lesson) => [lesson.id, { id: lesson.instructor_id, name: lesson.instructor_name }])),
    owedBack: facts.refunds
      .filter((refund) => refund.kind === 'offline' && refund.status === 'pending')
      .map((refund) => ({
        refundId: refund.id,
        at: refund.at,
        amountPence: refund.amount_pence,
        lessonAt: refund.lesson_at,
        instructorId: refund.instructor_id,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime()),
    history,
  };
}
