/**
 * Turning lessons that are close into the reminders they are owed (NTF-02, M2-30).
 *
 * The database says which lessons are near; packages/core says which reminders are due for
 * each of them and what a reminder calls the time. Nothing here talks to a database or a
 * provider, so the rule that a lesson which moved is reminded about at its new time is a
 * unit test rather than a hope.
 */

import type { NotificationChannel, PlannedNotification } from '@repo/core/notifications';
import { planNotifications } from '@repo/core/notifications';
import { dueReminders, reminderVersion, reminderWording, resolveReminderHours } from '@repo/core/reminders';
import { formatDate, formatTime } from '@repo/core/time';
import { notificationRows, type NotificationRow } from './booking-notices';

/** What `system_due_reminders` answers, one per lesson. */
export interface ReminderNotice {
  booking_id: string;
  business_id: string;
  business_plan: string;
  /** The Business settings, which may say how long before to remind (NTF-02). */
  reminder_settings: unknown;
  version: number;
  starts_at: string;
  created_at: string;
  learner_user_id: string;
  learner_name: string;
  learner_phone: string | null;
  instructor_user_id: string;
  instructor_name: string;
}

export interface ReminderPlanInput {
  notices: ReminderNotice[];
  now: Date;
  /** What each person has switched off for reminders (NTF-04). */
  muted?: Map<string, NotificationChannel[]>;
  /** Whether this Business's plan includes text messages at all (NTF-01). */
  textingAllowed: (notice: ReminderNotice) => boolean;
}

export interface PlannedReminder {
  notice: ReminderNotice;
  hoursBefore: number;
  planned: PlannedNotification[];
}

/**
 * Every reminder that has come due. The learner is the one reminded: Appendix B has the
 * instructor as optional, and an instructor who is sent a text about every lesson they teach
 * is an instructor who turns notifications off.
 */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const muted = input.muted ?? new Map<string, NotificationChannel[]>();
  const reminders: PlannedReminder[] = [];

  for (const notice of input.notices) {
    const startsAt = new Date(notice.starts_at);
    const hours = resolveReminderHours(notice.reminder_settings);
    const due = dueReminders({
      startsAt,
      createdAt: new Date(notice.created_at),
      now: input.now,
      hoursBefore: hours,
    });

    const unavailable: NotificationChannel[] = [];
    if (!input.textingAllowed(notice) || !notice.learner_phone) unavailable.push('sms');

    for (const hoursBefore of due) {
      const planned = planNotifications({
        kind: 'booking.reminder',
        entityId: notice.booking_id,
        // The version of the lesson and which reminder it is, so a lesson that moved is
        // reminded about again and nothing is sent twice (NTF-02).
        version: reminderVersion(notice.version, hoursBefore),
        facts: {
          learnerName: notice.learner_name,
          instructorName: notice.instructor_name,
          when: `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
          detail: reminderWording(hoursBefore),
        },
        recipients: [
          {
            userId: notice.learner_user_id,
            audience: 'learner',
            muted: muted.get(notice.learner_user_id),
            unavailable,
          },
        ],
        linkFor: () => '/app/learner/lessons',
      });

      if (planned.length > 0) reminders.push({ notice, hoursBefore, planned });
    }
  }

  return reminders;
}

/** Everybody who might be reminded, so their settings are looked up in one go. */
export function peopleToRemind(notices: ReminderNotice[]): string[] {
  return [...new Set(notices.map((notice) => notice.learner_user_id))];
}

/** The rows `system_notify` takes. */
export function reminderRows(reminders: PlannedReminder[]): NotificationRow[] {
  return reminders.flatMap((reminder) =>
    notificationRows(reminder.planned, {
      businessId: reminder.notice.business_id,
      entityType: 'booking',
      entityId: reminder.notice.booking_id,
    }),
  );
}
