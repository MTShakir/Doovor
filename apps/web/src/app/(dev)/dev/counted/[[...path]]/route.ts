import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Stands in for the counting service while the tests run (M6-08).
 *
 * The end to end tests prove that nothing is sent anywhere until somebody has said yes, which they
 * can only do if there is something to send to. Pointing the counting host at this route keeps
 * those requests on this machine: no real service is called with a made up key, and the test can
 * watch for a request without waiting on the internet. Local and test only, like every `/dev` route.
 */
function answer(): Response {
  if (!devRoutesOpen()) return new Response('Not found', { status: 404 });
  return Response.json({ status: 1 }, { headers: { 'cache-control': 'no-store' } });
}

export function GET(): Response {
  return answer();
}

export function POST(): Response {
  return answer();
}
