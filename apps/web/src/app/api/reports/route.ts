import { clientEnv } from '@/env/client';
import { forwardReport } from '@/lib/errors/tunnel';

/**
 * Browser error reports on their way to Sentry, so it only ever sees our server (M6-10, D-157).
 * The path is `reportsPath` in `lib/errors/sentry.ts`, which the browser library is given.
 */
export async function POST(request: Request): Promise<Response> {
  return forwardReport(request, clientEnv.NEXT_PUBLIC_SENTRY_DSN);
}
