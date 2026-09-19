import { beforeSend } from './reporting';

/**
 * What to tell the error service, wherever the code is running (M6-10, D-150).
 *
 * The library is fetched only when there is a DSN to send to. Imported at the top of this module it
 * would be in the bundle of every page whether or not anybody was watching, which is what a static
 * import of Zod cost the profile page seven Lighthouse points for (D-140).
 *
 * Without a DSN, then: nothing fetched, no requests, nothing stored.
 */
/**
 * Where the browser sends its reports: our own server, which passes them on (`app/api/reports`).
 * Sentry then never sees a visitor's address, and so never works out their town (D-157).
 */
export const reportsPath = '/api/reports';

export async function watchForErrors(dsn: string | undefined, environment: string, options: { tunnel?: string } = {}): Promise<void> {
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn,
    environment,
    ...(options.tunnel ? { tunnel: options.tunnel } : {}),
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
