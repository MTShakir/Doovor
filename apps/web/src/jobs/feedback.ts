import 'server-only';
import {
  feedbackHandledWords,
  feedbackReceivedWords,
  isFeedbackKind,
  type FeedbackKind,
} from '@repo/core/schemas/feedback';
import { renderNotificationEmail } from '@repo/emails';
import { z } from '@repo/core/zod';
import { getAppUrl } from '@/lib/app-url';
import { emailProvider } from '@/lib/email/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const reportSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.string(),
  message: z.string(),
  handled: z.boolean(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

export type FeedbackEmailResult = { sent: true } | { sent: false; reason: 'gone' | 'no_address' | 'refused' };

/** What a confirmation is about: the report arriving, or a person having dealt with it. */
export type FeedbackEmailKind = 'received' | 'handled';

/**
 * Tells somebody their report arrived, or that it has been dealt with (D-241).
 *
 * A job is nobody: it reads through a `system_*` function and never touches the table on anybody's
 * behalf. Both emails quote the reference, because that is the thing somebody writes down, and
 * both quote what they actually said, because a confirmation that does not is a confirmation of
 * nothing in particular.
 *
 * An address the provider refuses will be refused again, so it is recorded as sent. A provider
 * that cannot be reached throws, so the job runner tries again.
 */
export async function sendFeedbackEmail(kind: FeedbackEmailKind, id: string): Promise<FeedbackEmailResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_feedback_for_email', { p_feedback_id: id });
  if (error) throw new Error(`Could not read the report to confirm: ${error.message}`);
  if (data === null) return { sent: false, reason: 'gone' };

  const report = reportSchema.parse(data);
  // Somebody with no address on file cannot be written to. The report is still theirs and still
  // in the queue; this is the one thing that cannot be done about it.
  if (report.email === null || report.email.trim() === '') return { sent: false, reason: 'no_address' };

  const sort: FeedbackKind = isFeedbackKind(report.kind) ? report.kind : 'other';
  const words = kind === 'received' ? feedbackReceivedWords(report.reference, sort) : feedbackHandledWords(report.reference, sort);
  const firstName = report.name?.trim().split(/\s+/)[0];

  const email = await renderNotificationEmail({
    title: words.title,
    body: words.body,
    greeting: firstName ? `Hello ${firstName}` : undefined,
    facts: [
      { label: 'Your reference', value: report.reference },
      { label: 'What you told us', value: shortened(report.message) },
    ],
    action: { label: 'Tell us something else', url: new URL('/feedback', getAppUrl()).toString() },
    reason: words.reason,
  });

  const result = await emailProvider().send({
    to: report.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    // One per report per kind: the sweep delivers an event at least once, and two copies of
    // "we have got your message" is worse than none.
    idempotencyKey: `feedback-${kind}:${report.id}`,
  });

  if (!result.ok) {
    if (result.reason === 'REJECTED') return { sent: false, reason: 'refused' };
    throw new Error(`Could not email the confirmation: ${result.message}`);
  }
  return { sent: true };
}

/** Enough of what they said to recognise it, and not a wall of text in an email. */
function shortened(message: string): string {
  const line = message.trim().replace(/\s+/g, ' ');
  return line.length <= 160 ? line : `${line.slice(0, 159).trimEnd()}...`;
}
