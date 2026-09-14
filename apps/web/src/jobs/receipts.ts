import 'server-only';
import { receiptWords } from '@repo/core/receipts';
import { renderReceiptEmail } from '@repo/emails';
import { getAppUrl } from '@/lib/app-url';
import { emailProvider } from '@/lib/email/provider';
import { receiptFromRow, type ReceiptRow } from '@/lib/payments/receipt-row';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** What `system_issue_receipt` answers for a receipt. */
type IssuedReceipt = ReceiptRow & { emailed_at: string | null; learner_email: string | null; learner_name: string | null };

export type ReceiptResult =
  | { sent: true; receiptId: string }
  | { sent: false; reason: 'no_receipt' | 'already_sent' | 'no_email' | 'refused'; receiptId?: string }
  /** A payment recorded in person, which can still be taken back out until then (D-089). */
  | { sent: false; waitUntil: string };

/**
 * Issues the receipt for a payment and emails it to the learner (PAY-08, M3-20).
 *
 * The database gives the receipt its number and freezes what it says; this writes the email from
 * it and sends it once, under the receipt's own key, then records that it went. Running it again
 * sends nothing more. An address the provider refuses will be refused again, so it is recorded as
 * sent rather than tried for ever; a provider that cannot be reached throws, so the job tries again.
 */
export async function sendReceipt(paymentId: string): Promise<ReceiptResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_issue_receipt', { p_payment_id: paymentId });
  if (error) throw new Error(`Could not issue the receipt: ${error.message}`);
  if (data === null) return { sent: false, reason: 'no_receipt' };

  const answer = data as unknown as IssuedReceipt | { wait_until: string };
  if ('wait_until' in answer) return { sent: false, waitUntil: answer.wait_until };
  if (answer.emailed_at !== null) return { sent: false, reason: 'already_sent', receiptId: answer.id };
  if (!answer.learner_email) return { sent: false, reason: 'no_email', receiptId: answer.id };

  const firstName = answer.learner_name?.trim().split(/\s+/)[0];
  const email = await renderReceiptEmail({
    receipt: receiptWords(receiptFromRow(answer)),
    greeting: firstName ? `Hello ${firstName}` : undefined,
    url: new URL(`/receipts/${answer.payment_id}`, getAppUrl()).toString(),
  });

  const result = await emailProvider().send({
    to: answer.learner_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `receipt:${answer.id}`,
  });
  if (!result.ok && result.reason !== 'REJECTED') throw new Error(`Could not email the receipt: ${result.message}`);

  const marked = await supabase.rpc('system_mark_receipt_emailed', { p_receipt_id: answer.id });
  if (marked.error) throw new Error(`Could not record the receipt as sent: ${marked.error.message}`);

  return result.ok ? { sent: true, receiptId: answer.id } : { sent: false, reason: 'refused', receiptId: answer.id };
}
