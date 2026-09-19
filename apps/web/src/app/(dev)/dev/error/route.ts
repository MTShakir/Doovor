import { connection } from 'next/server';
import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Throws on purpose, so somebody can see whether errors arrive where they should (M6-10).
 *
 * The runbook uses it to prove the error service is wired once a DSN is set. It answers only on a
 * developer's machine and in the test runs, like every `/dev` route (M6-01).
 */
export async function GET(): Promise<Response> {
  // Waiting for the request keeps this out of the build: a route whose whole job is to throw would
  // otherwise throw while the app was being built, and take the build with it.
  await connection();
  if (!devRoutesOpen()) return new Response('Not found', { status: 404 });
  throw new Error('A test error, thrown on purpose by /dev/error (M6-10)');
}
