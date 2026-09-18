import { clientEnv } from '@/env/client';
import { watchForErrors } from '@/lib/errors/sentry';

/**
 * Runs in the browser before the app is interactive (M6-10).
 *
 * Only errors. Nothing is loaded and no request is made unless a DSN is set, so a developer's
 * machine and the test runs are untouched.
 */
// The host says which environment this is, so nothing new has to be set to tell them apart.
watchForErrors(clientEnv.NEXT_PUBLIC_SENTRY_DSN, window.location.hostname);
