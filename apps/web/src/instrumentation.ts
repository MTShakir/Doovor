import { watchForErrors } from '@/lib/errors/sentry';

/**
 * Runs once when the server starts: fail fast on a missing or invalid secret (M0-05), and start
 * watching for errors, on the server and in the jobs that run beside it (M6-10). Without a DSN the
 * watching does nothing at all.
 */
export async function register() {
  watchForErrors(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.APP_ENV ?? 'local');
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./env/server');
  }
}

/** Anything a request throws that the app did not answer for itself (M6-10). */
export const onRequestError = (await import('@sentry/nextjs')).captureRequestError;
