import { cron } from 'inngest';
import { inngest } from '../client';
import { sendPendingNotifications } from '../notifications-send';

/**
 * Sends the notifications the core has written, on the channels each of them carries
 * (NTF-01, NTF-03, D-072). Every minute, because somebody whose lesson was just called off
 * should hear about it while they are still near their phone.
 */
export const notificationDispatch = inngest.createFunction(
  { id: 'notification-dispatch', name: 'Send notifications', triggers: [cron('* * * * *')] },
  () => sendPendingNotifications(),
);
