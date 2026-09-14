import 'server-only';
import { notificationCatalogue, type NotificationCategory, type NotificationChannel } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  kindForEvent,
  notificationRows,
  peopleInvolved,
  planBookingNotifications,
  rowContextFor,
  type BookingEvent,
  type BookingNotice,
  type NotificationRow,
} from './booking-notices';

export interface NotifyResult {
  /** How many rows were written. A repeat of the same event writes none (ARCHITECTURE 10). */
  written: number;
}

/** What each of these people has switched off for one group of notifications (NTF-04). */
export async function mutedChannels(userIds: string[], category: NotificationCategory): Promise<Map<string, NotificationChannel[]>> {
  const muted = new Map<string, NotificationChannel[]>();
  if (userIds.length === 0) return muted;

  const { data, error } = await getSupabaseServiceClient().rpc('system_notification_mutes', { p_user_ids: userIds, p_category: category });
  if (error) throw new Error(`Could not read notification settings: ${error.message}`);
  for (const row of data) {
    muted.set(row.user_id, [...(muted.get(row.user_id) ?? []), row.channel]);
  }
  return muted;
}

/** Writes notifications, each once: a row whose key is already there is left alone. */
export async function writeNotifications(rows: NotificationRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await getSupabaseServiceClient().rpc('system_notify', { p_rows: rows });
  if (error) throw new Error(`Could not write notifications: ${error.message}`);
  return data;
}

/**
 * Tells everybody a lesson concerns what just happened to it (NTF-03, M2-27).
 *
 * A job is nobody: it reads through `system_*` functions and never touches a tenant table on
 * anybody's behalf. What it decides comes from packages/core, so the inbox, the email and the
 * push notice all say the same thing.
 */
export async function notifyAboutBooking(event: BookingEvent): Promise<NotifyResult> {
  const bookingId = typeof event.payload.booking_id === 'string' ? event.payload.booking_id : null;
  if (bookingId === null) return { written: 0 };

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_booking_notice', { p_booking_id: bookingId });
  if (error) throw new Error(`Could not read the lesson to notify about it: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as BookingNotice;
  const kind = kindForEvent(event, notice);
  if (kind === null) return { written: 0 };

  const muted = await mutedChannels(peopleInvolved(notice), notificationCatalogue[kind].category);
  const planned = planBookingNotifications({ event, notice, muted });
  return { written: await writeNotifications(notificationRows(planned, rowContextFor(notice))) };
}
