import { Inngest } from 'inngest';
import { serverEnv } from '@/env/server';

/**
 * The job runner client. Local and CI runs talk to the runner on this machine; hosted
 * environments use keys from the environment (INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY).
 */
export const inngest = new Inngest({
  id: 'platform-web',
  isDev: serverEnv.APP_ENV === 'local' || serverEnv.APP_ENV === 'test',
  eventKey: serverEnv.INNGEST_EVENT_KEY,
});
