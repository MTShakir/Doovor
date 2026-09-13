import 'server-only';
import { notificationCatalogue, type NotificationChannel } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  kindForEvent,
  notificationRows,
  peopleInvolved,
  planBookingNotifications,
  type BookingEvent,
  type BookingNotice,
} from './booking-notices';

export interface NotifyResult {
  /** How many rows were written. A repeat of the same event writes none (ARCHITECTURE 10). */
  written: number;
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

  const mutes = await supabase.rpc('system_notification_mutes', {
    p_user_ids: peopleInvolved(notice),
    p_category: notificationCatalogue[kind].category,
  });
  if (mutes.error) throw new Error(`Could not read notification settings: ${mutes.error.message}`);

  const muted = new Map<string, NotificationChannel[]>();
  for (const row of mutes.data) {
    muted.set(row.user_id, [...(muted.get(row.user_id) ?? []), row.channel]);
  }

  const planned = planBookingNotifications({ event, notice, muted });
  if (planned.length === 0) return { written: 0 };

  const written = await supabase.rpc('system_notify', { p_rows: notificationRows(planned, notice) });
  if (written.error) throw new Error(`Could not write notifications: ${written.error.message}`);
  return { written: written.data };
}
