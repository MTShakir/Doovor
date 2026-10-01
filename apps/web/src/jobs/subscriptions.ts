import 'server-only';
import { notificationCatalogue } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { mutedChannels, writeNotifications } from './notify';
import { renewalNotices, type RenewingSubscription } from './subscription-renewals';

export interface RenewalSweepResult {
  /** How many subscriptions were inside their notice window. */
  due: number;
  /** How many notices were written. A second run on the same day writes none. */
  written: number;
}

/**
 * The daily run: warn everybody whose Pro renews soon (9.18, D-237).
 *
 * A job is nobody. It reads through a `system_*` function and writes notifications through
 * another, and never touches a tenant table on anybody's behalf.
 *
 * Running twice in a day writes nothing the second time: the day the subscription renews is in
 * each notice's key, so the row is already there. That matters more here than elsewhere, because
 * the notice goes out by text and a duplicate costs money as well as goodwill.
 */
export async function runRenewalNotices(now: Date = new Date()): Promise<RenewalSweepResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_subscriptions_renewing', { p_now: now.toISOString() });
  if (error) throw new Error(`Could not read renewing subscriptions: ${error.message}`);

  const due: RenewingSubscription[] = data.map((row) => ({
    businessId: row.business_id,
    ownerUserId: row.owner_user_id,
    interval: row.billing_interval,
    renewsAt: new Date(row.renews_at),
    monthsPaid: row.months_paid,
  }));
  if (due.length === 0) return { due: 0, written: 0 };

  const notices = renewalNotices(due);
  const category = notificationCatalogue['subscription.renewing'].category;
  const muted = await mutedChannels(
    [...new Set(notices.map((notice) => notice.userId))],
    category,
  );

  const written = await writeNotifications(
    notices.map((notice) => {
      const off = muted.get(notice.userId) ?? [];
      return {
        user_id: notice.userId,
        business_id: notice.businessId,
        kind: 'subscription.renewing',
        category,
        title: 'Your Pro renews soon',
        body: notice.detail,
        link: '/app/instructor/plan',
        // What somebody switched off is honoured, except the inbox: this warns about money
        // leaving an account, and a charge nobody was told about is the thing to avoid.
        channels: notice.channels.filter((channel) => channel === 'in_app' || !off.includes(channel)),
        entity_type: 'business',
        entity_id: notice.businessId,
        dedupe_key: notice.dedupeKey,
      };
    }),
  );

  return { due: due.length, written };
}
