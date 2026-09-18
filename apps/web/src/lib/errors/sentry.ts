import * as Sentry from '@sentry/nextjs';
import { beforeSend } from './reporting';

/**
 * What to tell the error service, wherever the code is running (M6-10, D-150).
 *
 * Without a DSN it does nothing at all: no requests, nothing stored, nothing to configure on a
 * developer's machine. With one it sends errors and a tenth of traces, never a session recording,
 * and never anything the scrubber next door has taken out.
 */
export function watchForErrors(dsn: string | undefined, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    // Errors always; a tenth of traces, which is enough to see where time goes without paying for
    // every request.
    tracesSampleRate: 0.1,
    // Nothing of what somebody typed or saw is ever recorded (NFR-PRV-02).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
}
