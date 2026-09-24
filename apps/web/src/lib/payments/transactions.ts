import 'server-only';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const iso = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const pence = z.number().int();

// The functions answer JSON, so what comes back is read the way any input is.
const transactionSchema = z.object({
  id: z.string(),
  at: iso,
  kind: z.enum(['payment', 'refund']),
  amount_pence: pence,
  learner_id: z.string(),
  learner_name: z.string(),
  method: z.string().nullable(),
  refunded_pence: pence,
  refund_kind: z.string().nullable(),
  status: z.string().nullable(),
  lesson_at: iso.nullable(),
  credit_minutes: pence.nullable(),
});

const pageSchema = z.object({ more: z.boolean(), rows: z.array(transactionSchema) });

const owedSchema = z.array(
  z.object({
    id: z.string(),
    at: iso,
    amount_pence: pence,
    learner_id: z.string(),
    learner_name: z.string(),
    reason: z.string(),
    lesson_at: iso.nullable(),
  }),
);

/** Money in or money back, as the Money screen lists it (MNY-01, D-195). */
export interface Transaction {
  id: string;
  at: Date;
  kind: 'payment' | 'refund';
  amountPence: number;
  learnerId: string;
  learnerName: string;
  /** Card, cash or bank, for money coming in. */
  method: string | null;
  refundedPence: number;
  /** Whether a refund went back to a card or is being handed over in person. */
  refundKind: string | null;
  /** A refund still waiting to be handed back says `pending`. */
  status: string | null;
  lessonAt: Date | null;
  /** The minutes a package bought, when the payment was for one. */
  creditMinutes: number | null;
}

export interface TransactionPage {
  rows: Transaction[];
  /** Whether asking for the next page would find anything. */
  more: boolean;
}

/**
 * A page of transactions, newest first. Null when the person looking may not see what the
 * Business took, which is a manager the owner has not allowed (PRD 6.2).
 */
export async function moneyTransactions(businessId: string, limit: number, offset = 0): Promise<TransactionPage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('money_transactions', {
    p_business_id: businessId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || data === null) return null;

  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    more: parsed.data.more,
    rows: parsed.data.rows.map((row) => ({
      id: row.id,
      at: row.at,
      kind: row.kind,
      amountPence: row.amount_pence,
      learnerId: row.learner_id,
      learnerName: row.learner_name,
      method: row.method,
      refundedPence: row.refunded_pence,
      refundKind: row.refund_kind,
      status: row.status,
      lessonAt: row.lesson_at,
      creditMinutes: row.credit_minutes,
    })),
  };
}

/** Cash or a bank transfer owed back and not yet handed over (R-08, PAY-07). */
export interface OwedRefund {
  refundId: string;
  at: Date;
  amountPence: number;
  learnerId: string;
  learnerName: string;
  reason: string;
  lessonAt: Date | null;
}

/** What this Business still owes back, the longest owed first. Empty when there is nothing. */
export async function pendingRefunds(businessId: string): Promise<OwedRefund[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('pending_refunds', { p_business_id: businessId });
  if (error) return [];

  const parsed = owedSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({
    refundId: row.id,
    at: row.at,
    amountPence: row.amount_pence,
    learnerId: row.learner_id,
    learnerName: row.learner_name,
    reason: row.reason,
    lessonAt: row.lesson_at,
  }));
}
