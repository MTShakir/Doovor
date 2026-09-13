import 'server-only';
import { getEntitlements, type PlanKey } from '@repo/config/plans';
import type { NotificationChannel } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  peopleToRemind,
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

function isPlan(value: string): value is PlanKey {
  return value === 'free' || value === 'pro' || value === 'school';
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

  const reminders = planReminders({
    notices,
    now,
    muted,
    // Text messages are a Pro thing (NTF-01). The cap is counted when one is sent.
    textingAllowed: (notice) =>
      isPlan(notice.business_plan) && getEntitlements(notice.business_plan).smsRemindersPerMonth > 0,
  });
  if (reminders.length === 0) return { looked: notices.length, written: 0 };

  const written = await supabase.rpc('system_notify', { p_rows: reminderRows(reminders) });
  if (written.error) throw new Error(`Could not write reminders: ${written.error.message}`);
  return { looked: notices.length, written: written.data };
}
