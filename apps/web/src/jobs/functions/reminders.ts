import { cron } from 'inngest';
import { inngest } from '../client';
import { sendDueReminders } from '../reminders';

/**
 * Reminders before a lesson (NTF-02). Every five minutes: the reminder itself carries the
 * lesson's version, so a lesson that moved is reminded about at its new time and never at
 * its old one.
 */
export const reminderSweep = inngest.createFunction(
  { id: 'reminder-sweep', name: 'Remind before a lesson', triggers: [cron('*/5 * * * *')] },
  () => sendDueReminders(),
);
