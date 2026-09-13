import 'server-only';
import { renderNotificationEmail } from '@repo/emails';
import { getAppUrl } from '@/lib/app-url';
import { emailProvider } from '@/lib/email/provider';
import { pushConfigured, sendPush } from '@/lib/notifications/push';
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

    let trouble: string | null = null;
    let refused = false;

    if (wantsEmail(one)) {
      const email = await renderNotificationEmail(emailPropsFor(one, { appUrl }));
      const result = await provider.send({
        to: one.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: one.dedupeKey,
      });
      if (!result.ok) {
        trouble = result.message;
        refused = result.reason === 'REJECTED';
      }
    }

    // Every browser this person signed up, and any that have gone are forgotten (NTF-01).
    if (one.channels.includes('push') && pushConfigured()) {
      const targets = await supabase.rpc('system_push_targets', { p_user_id: one.userId });
      for (const target of targets.data ?? []) {
        const result = await sendPush(target, {
          title: one.title,
          body: one.body,
          url: one.link,
          tag: one.kind,
        });
        if (result.ok) {
          await supabase.rpc('system_touch_push_target', { p_id: target.id });
          continue;
        }
        if (result.gone) {
          await supabase.rpc('system_drop_push_target', { p_id: target.id });
          continue;
        }
        trouble ??= result.message;
      }
    }

    if (trouble === null) {
      sent.push(one.id);
      continue;
    }
    failed += 1;
    await supabase.rpc('system_mark_notification_failed', { p_id: one.id, p_error: trouble });
    // A refusal will be refused again: stop it being claimed rather than trying five times.
    if (refused) {
      await supabase.rpc('system_mark_notifications_sent', { p_ids: [one.id] });
    }
  }

  if (sent.length > 0) {
    const marked = await supabase.rpc('system_mark_notifications_sent', { p_ids: sent });
    if (marked.error) throw new Error(`Could not mark notifications sent: ${marked.error.message}`);
  }

  return { sent: sent.length, failed };
}
