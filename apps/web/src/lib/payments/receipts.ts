import 'server-only';
import type { Receipt } from '@repo/core/receipts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { receiptFromRow } from './receipt-row';

export interface ReceiptPage {
  receipt: Receipt;
  /** Money given back since, which the receipt itself does not change for (PAY-07). */
  refundedPence: number;
}

/**
 * The receipt for a payment, read under row-level security: the learner, whoever paid, the people
 * who run the Business and the learner's instructor. Null for anybody else, and for a payment that
 * has no receipt yet.
 */
export async function receiptForPayment(paymentId: string): Promise<ReceiptPage | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('receipts')
    .select(
      'id, payment_id, number, issued_at, business_name, business_address, vat_number, vat_rate_percent, vat_pence, amount_pence, method, kind, lesson_starts_at, lesson_minutes, lesson_type, instructor_name, credit_minutes, payments(refunded_pence)',
    )
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (!data) return null;

  return { receipt: receiptFromRow(data), refundedPence: data.payments.refunded_pence };
}

export interface ReceiptDetails {
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  vatNumber: string;
}

/** What a Business puts on its receipts today, for the form that changes it (PAY-08). */
export async function receiptDetails(businessId: string): Promise<ReceiptDetails> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('businesses').select('address, vat_number').eq('id', businessId).maybeSingle();
  const address = typeof data?.address === 'object' && data.address !== null && !Array.isArray(data.address) ? data.address : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    line1: text(address.line1),
    line2: text(address.line2),
    town: text(address.town),
    postcode: text(address.postcode),
    vatNumber: data?.vat_number ?? '',
  };
}
