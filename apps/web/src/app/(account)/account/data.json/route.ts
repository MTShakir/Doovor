import { exportFileName, myData } from '@/lib/account/export';
import { getAccess } from '@/lib/auth/session';

/**
 * Everything we hold about you, as a file (NFR-PRV-03, M6-11).
 *
 * The database decides what is in it from the session, so this only has to hand it over. Every
 * download is written to the audit trail by the database itself, not by this route.
 */
export async function GET(): Promise<Response> {
  const result = await getAccess();
  if (!result) return new Response('Sign in first', { status: 401 });

  const data = await myData();
  if (data === null) return new Response('Your data could not be gathered. Try again.', { status: 500 });

  const account = data.account as { full_name?: string } | null | undefined;
  const name = account?.full_name ?? '';
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(name, new Date(), 'json')}"`,
      'cache-control': 'no-store',
    },
  });
}
