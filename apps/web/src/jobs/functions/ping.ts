import { inngest } from '../client';
import { systemPing } from '../events';

/**
 * Proves the whole path works: an RPC records an outbox event, the dispatcher sends it and
 * the runner delivers it here (M1-01). Harmless in every environment.
 */
export const systemPingFunction = inngest.createFunction(
  { id: 'system-ping', name: 'System ping', triggers: [systemPing] },
  ({ event }) => ({ receivedAt: new Date().toISOString(), sentAt: event.data.at }),
);
