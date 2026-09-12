import { cron } from 'inngest';
import { inngest } from '../client';
import { sendPendingEvents } from '../outbox';

/**
 * Safety net for the transactional outbox (D-017): anything the dispatcher missed, because the
 * app stopped between the database commit and the send, goes out within a minute.
 */
export const outboxSweep = inngest.createFunction(
  { id: 'outbox-sweep', name: 'Outbox sweep', triggers: [cron('* * * * *')] },
  () => sendPendingEvents(),
);
