import { cron } from 'inngest';
import { inngest } from '../client';
import { bookingReminderRequested } from '../events';
import { thenSend } from '../notifications-send';
import { remindByHand, sendDueReminders } from '../reminders';
import { schedules } from '../schedules';

/**
 * Reminders before a lesson (NTF-02). Every five minutes: the reminder itself carries the
 * lesson's version, so a lesson that moved is reminded about at its new time and never at
 * its old one. Sent in the same run, so five minutes before a lesson is five minutes (D-271).
 */
export const reminderSweep = inngest.createFunction(
  { id: 'reminder-sweep', name: 'Remind before a lesson', triggers: [cron(schedules.reminders)] },
  () => sendDueReminders().then(thenSend),
);

/** A reminder asked for by hand, from a lesson's sheet (NTF-02, D-166). */
export const reminderByHand = inngest.createFunction(
  { id: 'reminder-by-hand', name: 'Send a reminder asked for', triggers: [bookingReminderRequested] },
  ({ event }) => remindByHand(event.data).then(thenSend),
);
