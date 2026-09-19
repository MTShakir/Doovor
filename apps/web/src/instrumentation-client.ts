import { clientEnv } from '@/env/client';
import { reportsPath, watchForErrors } from '@/lib/errors/sentry';

/**
 * Runs in the browser before the app is interactive (M6-10).
 *
 * Only errors, and only when there is somewhere to send them: with no DSN the library is never
 * fetched, so a developer's machine, the test runs and every visitor's first paint are untouched.
 * The host says which environment this is, so nothing new has to be set to tell them apart.
 * Reports go through our own server, so Sentry never sees where a visitor is (D-157).
 */
void watchForErrors(clientEnv.NEXT_PUBLIC_SENTRY_DSN, window.location.hostname, { tunnel: reportsPath });
