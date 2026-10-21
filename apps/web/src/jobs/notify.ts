import 'server-only';
import { usableCards } from '@repo/core/cards';
import { notificationCatalogue, type NotificationCategory, type NotificationChannel, type NotificationKind } from '@repo/core/notifications';
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

  // A fee is said to be charged to a saved card only when there is one to charge it to (D-310).
  const told =
    feeKinds.includes(kind) && event.payload.charging === true && !(await feeComesOffACard(bookingId, notice))
      ? { ...event, payload: { ...event.payload, charging: false } }
      : event;

  const muted = await mutedChannels(peopleInvolved(notice), notificationCatalogue[kind].category);
  const planned = planBookingNotifications({ event: told, notice, muted });
  return { written: await writeNotifications(notificationRows(planned, rowContextFor(notice))) };
}

/** The notices that can say a fee is being charged to a kept card. */
const feeKinds: readonly NotificationKind[] = ['booking.cancelled', 'booking.no_show', 'booking.dispute_decided'];

/**
 * Whether a fee the database asked to be charged really comes off a card: one already charged, or
 * a usable card the Business keeps for the learner. The database knows only that the learner is a
 * customer of the Business, which any card payment makes them, saved card or not; the cards
 * themselves are the provider's to list (D-310). Without one, the fee is owed and they are told so.
 */
export async function feeComesOffACard(bookingId: string, notice: BookingNotice, now = new Date()): Promise<boolean> {
  if (notice.payment_status === 'paid_card') return true;
  const { data, error } = await getSupabaseServiceClient().rpc('system_fee_to_charge', { p_booking_id: bookingId });
  if (error) throw new Error(`Could not read the fee to charge: ${error.message}`);
  if (data === null) return false;
  const fee = data as unknown as { account_id: string; customer_id: string | null };
  if (fee.customer_id === null) return false;

  // Loaded only once there is a fee to ask about: the provider reads the server's keys, which every
  // other notice, and every test of one, has no need of.
  const { paymentsProvider } = await import('@/lib/payments/provider');
  const listed = await paymentsProvider().listSavedCards({ accountId: fee.account_id, customerId: fee.customer_id });
  if (!listed.ok) {
    if (listed.reason === 'UNAVAILABLE' || listed.reason === 'NOT_CONFIGURED') {
      throw new Error(`Could not read a learner's cards: ${listed.message}`);
    }
    return false;
  }
  return usableCards(listed.data, now).length > 0;
}
