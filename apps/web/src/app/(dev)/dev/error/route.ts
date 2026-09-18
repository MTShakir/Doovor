import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Throws on purpose, so somebody can see whether errors arrive where they should (M6-10).
 *
 * The runbook uses it to prove the error service is wired after a DSN is set. Local, test and
 * staging only, like every `/dev` route: in production there is nothing here to press.
 */
export function GET(): Response {
  if (!devRoutesOpen()) return new Response('Not found', { status: 404 });
  throw new Error('A test error, thrown on purpose by /dev/error (M6-10)');
}
