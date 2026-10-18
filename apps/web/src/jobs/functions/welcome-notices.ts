import { inngest } from '../client';
import { accountEmailConfirmed } from '../events';
import { thenSend } from '../notifications-send';
import { notifyWelcome } from '../welcome-notices';

/** Somebody's email is confirmed: welcome them, by email and in the inbox (NTF-03, NTF-06, D-259). */
export const welcomeNotices = inngest.createFunction(
  { id: 'welcome-notices', name: 'Welcome somebody whose email is confirmed', triggers: [accountEmailConfirmed] },
  ({ event }) => notifyWelcome(event.data.user_id).then(thenSend),
);
