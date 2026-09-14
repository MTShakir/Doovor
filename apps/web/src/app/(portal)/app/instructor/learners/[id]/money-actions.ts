'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const packageSaleSchema = z.object({
  learnerId: z.uuid(),
  packageId: z.uuid(),
  method: z.enum(['cash', 'bank']),
});

/**
 * PAY-04, PAY-05, M3-16: a package the learner paid for in person. The function decides who may
 * record one and writes the payment and the credit it buys together. Returns the lot of credit.
 */
export async function recordOfflinePackage(input: unknown): Promise<Result<{ lotId: string }>> {
  const parsed = packageSaleSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('record_offline_package', {
    p_learner_id: parsed.data.learnerId,
    p_package_id: parsed.data.packageId,
    p_method: parsed.data.method,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok({ lotId: data });
}

const handBackSchema = z.object({ refundId: z.uuid(), learnerId: z.uuid() });

/**
 * R-08, PAY-07, M3-18: cash or a bank transfer owed back, marked handed back. The function decides
 * who may, and settles the refund, the payment and the lesson together.
 */
export async function markHandedBack(input: unknown): Promise<Result<null>> {
  const parsed = handBackSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('settle_offline_refund', { p_refund_id: parsed.data.refundId });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  revalidatePath('/app/instructor/diary');
  return ok(null);
}

const decisionSchema = z.object({
  disputeId: z.uuid(),
  learnerId: z.uuid(),
  outcome: z.enum(['waived', 'kept']),
  note: z.string().trim().max(1000).default(''),
});

/**
 * R-09, PAY-07, M3-19: an owner or manager decides a learner's dispute of a no-show. Waiving gives
 * back whatever paid the fee; the function decides who may, and does it all together.
 */
export async function decideNoShowDispute(input: unknown): Promise<Result<null>> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('decide_no_show_dispute', {
    p_dispute_id: parsed.data.disputeId,
    p_outcome: parsed.data.outcome,
    p_note: parsed.data.note === '' ? undefined : parsed.data.note,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  revalidatePath('/app/instructor/diary');
  return ok(null);
}

const optionsSchema = z.object({ paymentId: z.uuid() });

// The function answers JSON, so it is read the way any input is.
const optionsFactsSchema = z.object({
  payment_id: z.string(),
  method: z.enum(['card', 'cash', 'bank', 'credit']),
  amount_pence: z.number().int(),
  refundable_pence: z.number().int(),
  lesson_at: z.string().nullable(),
  lesson_minutes: z.number().int().nullable(),
  lot: z
    .object({
      minutes_total: z.number().int(),
      usable_minutes: z.number().int(),
      price_pence: z.number().int(),
      value_pence: z.number().int(),
    })
    .nullable(),
});

export interface RefundOptions {
  paymentId: string;
  method: 'card' | 'cash' | 'bank' | 'credit';
  amountPence: number;
  /** What is left to give back, less anything already on its way back. */
  refundablePence: number;
  lessonAt: string | null;
  lessonMinutes: number | null;
  /** For credit bought: how much of it is unused, and what that is worth (PAY-07). */
  lot: { minutesTotal: number; usableMinutes: number; pricePence: number; valuePence: number } | null;
}

/** PAY-07, M3-17: what can be given back for a payment. Only for those who may refund it. */
export async function refundOptions(input: unknown): Promise<Result<RefundOptions>> {
  const parsed = optionsSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('refund_options', { p_payment_id: parsed.data.paymentId });
  if (error) return err(parsePostgresError(error).code);

  const facts = optionsFactsSchema.safeParse(data);
  if (!facts.success) return err('UNKNOWN');
  const { lot } = facts.data;
  return ok({
    paymentId: facts.data.payment_id,
    method: facts.data.method,
    amountPence: facts.data.amount_pence,
    refundablePence: facts.data.refundable_pence,
    lessonAt: facts.data.lesson_at,
    lessonMinutes: facts.data.lesson_minutes,
    lot:
      lot === null
        ? null
        : { minutesTotal: lot.minutes_total, usableMinutes: lot.usable_minutes, pricePence: lot.price_pence, valuePence: lot.value_pence },
  });
}

const refundSchema = z
  .object({
    paymentId: z.uuid(),
    learnerId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    to: z.enum(['payment', 'credit']),
    amountPence: z.number().int().positive().optional(),
    minutes: z.number().int().positive().optional(),
  })
  // A lesson is refunded by an amount and credit by the minute, never both at once.
  .refine((value) => value.amountPence === undefined || value.minutes === undefined);

/**
 * PAY-07, NFR-SEC-06, M3-17: gives money back, with a reason. The function decides who may, and
 * writes the refund, the audit row and anything it does to credit together.
 */
export async function issueRefund(input: unknown): Promise<Result<{ refundId: string }>> {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', 'Say why, and how much to give back.');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('issue_refund', {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
    p_amount_pence: parsed.data.amountPence,
    p_minutes: parsed.data.minutes,
    p_to: parsed.data.to,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok({ refundId: data });
}
