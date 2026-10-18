import { cron } from 'inngest';
import { inngest } from '../client';
import { sendPendingNotifications } from '../notifications-send';
import { sendPendingEvents } from '../outbox';
import { schedules } from '../schedules';

/**
 * The transactional outbox's sweep (D-017), every three minutes (D-271): events waiting in the
 * database go to the runner, and notifications whose sending failed are tried again. A
 * notification is sent by the job that writes it, so this is the only other way out.
 */
export const outboxSweep = inngest.createFunction(
  { id: 'outbox-sweep', name: 'Send what is waiting', triggers: [cron(schedules.outbox)] },
  async () => ({ events: await sendPendingEvents(), notifications: await sendPendingNotifications() }),
);
