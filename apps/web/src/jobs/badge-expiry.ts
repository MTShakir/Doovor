/**
 * Warning an instructor that their badge is running out, and taking an expired one out of
 * search (INS-03, M1-13).
 *
 * The rules are in core and the database claims each reminder, so this module only decides
 * what to do with what it is given. It holds no database or job-runner code, which is what
 * lets the whole thing be run against a fixed day.
 */

import { reminderSummary } from '@repo/core/badge-expiry';

export interface DueReminder {
  instructorId: string;
  businessId: string;
  badgeExpiry: string;
  daysBefore: number;
  daysLeft: number;
}

/** What the sweep needs from the database: the two `system_*` functions. */
export interface BadgeStore {
  claimReminders: (today: string) => Promise<DueReminder[]>;
  unlistExpired: (today: string) => Promise<number>;
}

export interface BadgeReminderMessage {
  instructorId: string;
  businessId: string;
  daysBefore: number;
  summary: string;
}

export type SendReminders = (messages: BadgeReminderMessage[]) => Promise<void>;

export interface BadgeSweepResult {
  reminded: number;
  unlisted: number;
}

/**
 * Claims today's reminders, sends them, then hides the profiles whose badge has run out.
 *
 * Claiming first means a retry cannot send the same warning twice. Unlisting happens after,
 * and separately: an instructor whose badge expired today should have had their warnings
 * already, and hiding them is not a reason to skip anyone else's.
 */
export async function sweepBadges(store: BadgeStore, send: SendReminders, today: string): Promise<BadgeSweepResult> {
  const due = await store.claimReminders(today);
  if (due.length > 0) {
    await send(
      due.map((reminder) => ({
        instructorId: reminder.instructorId,
        businessId: reminder.businessId,
        daysBefore: reminder.daysBefore,
        summary: reminderSummary(reminder.badgeExpiry, today),
      })),
    );
  }
  return { reminded: due.length, unlisted: await store.unlistExpired(today) };
}
