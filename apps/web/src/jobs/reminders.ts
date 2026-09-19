import 'server-only';
import type { NotificationChannel } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { readPlanLimits, smsAllowance } from './plan-limits';
import { mutedChannels, writeNotifications } from './notify';
import {
  peopleToRemind,
  planReminderByHand,
  planReminders,
  reminderRows,
  type ReminderNotice,
} from './reminder-notices';

export interface ReminderSweepResult {
  /** Lessons close enough to be worth asking about. */
  looked: number;
  /** Reminders written. A reminder already written writes nothing (ARCHITECTURE 10). */
  written: number;
}

/**
 * Reminders before a lesson (NTF-02, M2-30). Every few minutes, because a reminder that is
 * twenty minutes late is a reminder somebody has already worked out for themselves.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderSweepResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc('system_due_reminders', { p_within_hours: 26 });
  if (error) throw new Error(`Could not read the lessons to remind about: ${error.message}`);

  const notices = (data ?? []) as unknown as ReminderNotice[];
  if (notices.length === 0) return { looked: 0, written: 0 };

  const mutes = await supabase.rpc('system_notification_mutes', {
    p_user_ids: peopleToRemind(notices),
    p_category: 'reminders',
  });
  if (mutes.error) throw new Error(`Could not read notification settings: ${mutes.error.message}`);

  const muted = new Map<string, NotificationChannel[]>();
  for (const row of mutes.data) {
    muted.set(row.user_id, [...(muted.get(row.user_id) ?? []), row.channel]);
  }

  const limits = await readPlanLimits();
  const reminders = planReminders({
    notices,
    now,
    muted,
    // Text messages are for plans that include some (NTF-01, ADM-05). The cap is counted when one is sent.
    textingAllowed: (notice) => smsAllowance(notice.business_plan, limits) > 0,
  });
  if (reminders.length === 0) return { looked: notices.length, written: 0 };

  const written = await supabase.rpc('system_notify', { p_rows: reminderRows(reminders) });
  if (written.error) throw new Error(`Could not write reminders: ${written.error.message}`);
  return { looked: notices.length, written: written.data };
}

/**
 * A reminder an instructor asked for from the lesson's sheet (NTF-02, D-166). The database has
 * already checked who asked, and how often; this sends it the way the automatic ones go.
 */
export async function remindByHand(payload: Record<string, unknown>, now: Date = new Date()): Promise<{ written: number }> {
  const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : null;
  const channel = payload.channel === 'email' || payload.channel === 'sms' ? payload.channel : null;
  const requestedAt = typeof payload.requested_at === 'string' ? payload.requested_at : now.toISOString();
  if (bookingId === null || channel === null) return { written: 0 };

  const { data, error } = await getSupabaseServiceClient().rpc('system_reminder_notice', { p_booking_id: bookingId });
  if (error) throw new Error(`Could not read the lesson to remind about: ${error.message}`);
  // Cancelled, moved into the past or gone since it was asked for: nothing to remind about.
  if (data === null) return { written: 0 };

  const notice = data as unknown as ReminderNotice;
  const [muted, limits] = await Promise.all([mutedChannels([notice.learner_user_id], 'reminders'), readPlanLimits()]);
  const reminder = planReminderByHand({
    notice,
    channel,
    now,
    requestedAt,
    muted,
    textingAllowed: (one) => smsAllowance(one.business_plan, limits) > 0,
  });
  if (reminder === null) return { written: 0 };
  return { written: await writeNotifications(reminderRows([reminder])) };
}
