import 'server-only';
import { renderNotificationEmail } from '@repo/emails';
import { getAppUrl } from '@/lib/app-url';
import { emailProvider } from '@/lib/email/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { emailPropsFor, wantsEmail, type ClaimedNotification } from './notification-emails';

export interface SendResult {
  sent: number;
  failed: number;
}

/**
 * Sends what the notification core decided to send (NTF-01, NTF-03, M2-28).
 *
 * Email today; push and text messages join the same loop in M2-29 and M2-30, on the channels
 * each row already carries (D-072). Claiming counts an attempt, and the provider is given the
 * notification's own key, so neither a retry here nor a retry at Resend sends twice.
 */
export async function sendPendingNotifications(limit = 25): Promise<SendResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_claim_notifications', { p_limit: limit });
  if (error) throw new Error(`Could not claim notifications: ${error.message}`);
  if (data.length === 0) return { sent: 0, failed: 0 };

  const provider = emailProvider();
  const appUrl = getAppUrl();
  const sent: string[] = [];
  let failed = 0;

  for (const row of data) {
    const one: ClaimedNotification = {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      channels: row.channels,
      dedupeKey: row.dedupe_key,
    };

    if (!wantsEmail(one)) {
      // Nothing to send yet: its channels arrive in a later milestone.
      sent.push(one.id);
      continue;
    }

    const email = await renderNotificationEmail(emailPropsFor(one, { appUrl }));
    const result = await provider.send({
      to: one.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: one.dedupeKey,
    });

    if (result.ok) {
      sent.push(one.id);
      continue;
    }
    failed += 1;
    await supabase.rpc('system_mark_notification_failed', { p_id: one.id, p_error: result.message });
    // A refusal will be refused again: stop it being claimed rather than trying five times.
    if (result.reason === 'REJECTED') {
      await supabase.rpc('system_mark_notifications_sent', { p_ids: [one.id] });
    }
  }

  if (sent.length > 0) {
    const marked = await supabase.rpc('system_mark_notifications_sent', { p_ids: sent });
    if (marked.error) throw new Error(`Could not mark notifications sent: ${marked.error.message}`);
  }

  return { sent: sent.length, failed };
}
