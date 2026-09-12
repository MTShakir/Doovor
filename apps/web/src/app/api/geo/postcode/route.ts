import { getGeoProvider } from '@/lib/geo/provider';
import { answerFor } from '@/lib/geo/lookup';
import { getAccess } from '@/lib/auth/session';

/**
 * Postcode lookup for the screens that need coordinates (COV-03, M1-05).
 *
 * Signing in is required: every miss costs an upstream request and writes to the shared
 * cache. The answer is never stored by a browser or a proxy, because it is only ever one
 * step in a form someone is filling in.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getAccess();
  if (!access) {
    return Response.json(
      { ok: false, code: 'NOT_AUTHENTICATED', message: 'Sign in to carry on.' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const postcode = new URL(request.url).searchParams.get('postcode') ?? '';
  const geo = await getGeoProvider();
  const { status, body } = answerFor(await geo.lookup(postcode));
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
