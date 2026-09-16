import 'server-only';
import { captureConfirmationWords, type CaptureKind } from '@repo/core/schemas/capture';
import { renderNotificationEmail } from '@repo/emails';
import { z } from 'zod';
import { getAppUrl } from '@/lib/app-url';
import { emailProvider } from '@/lib/email/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const confirmationSchema = z.object({
  email: z.string(),
  fullName: z.string(),
  postcodeArea: z.string(),
  token: z.string(),
  sent: z.boolean(),
});

export type CaptureConfirmationResult = { sent: true } | { sent: false; reason: 'gone' | 'already_sent' | 'refused' };

export function isCaptureKind(value: unknown): value is CaptureKind {
  return value === 'waiting_list' || value === 'lesson_request';
}

/**
 * Emails the confirmation for a place on an area's waiting list or a lesson request (MKT-10,
 * M5-10), once, with the one button that removes everything kept for the address (D-117). The
 * database decides whether an address is due one at all. An address the provider refuses will be
 * refused again, so it is recorded as sent; a provider that cannot be reached throws, so the job
 * tries again.
 */
export async function sendCaptureConfirmation(kind: CaptureKind, id: string): Promise<CaptureConfirmationResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_learner_capture_confirmation', { p_kind: kind, p_id: id });
  if (error) throw new Error(`Could not read what to confirm: ${error.message}`);
  if (data === null) return { sent: false, reason: 'gone' };

  const entry = confirmationSchema.parse(data);
  if (entry.sent) return { sent: false, reason: 'already_sent' };

  const words = captureConfirmationWords(kind, entry.postcodeArea);
  const firstName = entry.fullName.trim().split(/\s+/)[0];
  const email = await renderNotificationEmail({
    title: words.title,
    body: words.body,
    greeting: firstName ? `Hello ${firstName}` : undefined,
    action: { label: words.action, url: new URL(`/your-details/${entry.token}`, getAppUrl()).toString() },
  });

  const result = await emailProvider().send({
    to: entry.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `learner-capture:${id}`,
  });
  if (!result.ok && result.reason !== 'REJECTED') throw new Error(`Could not email the confirmation: ${result.message}`);

  const marked = await supabase.rpc('system_mark_learner_capture_confirmed', { p_kind: kind, p_id: id });
  if (marked.error) throw new Error(`Could not record the confirmation as sent: ${marked.error.message}`);

  return result.ok ? { sent: true } : { sent: false, reason: 'refused' };
}
