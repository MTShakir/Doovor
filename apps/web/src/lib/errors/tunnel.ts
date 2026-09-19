import 'server-only';
import { reportsPath } from './sentry';

/**
 * Browser error reports, passed on to Sentry from our own server (M6-10, D-157).
 *
 * Sent straight from the browser, a report reaches Sentry from the visitor's address, and Sentry
 * works out their town from it before dropping the address: the one thing about a person the
 * scrubber (D-150) cannot remove, because it is not in the report. Sent here first, a report
 * reaches Sentry from our server, and all Sentry can place is the data centre.
 *
 * Only reports for our own project are passed on, so this cannot be used to reach anybody else's,
 * and nothing of the request travels with them: no cookie, no address, no browser.
 */
export { reportsPath };

/** Larger than any error report with its breadcrumbs. Replays and attachments are never sent (NFR-PRV-02). */
const largestReport = 1_000_000;

/** Where a DSN's reports are delivered, or nothing when it is not one of Sentry's. */
function ingestFor(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+|\/+$/g, '');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.sentry.io') || !/^\d+$/.test(project)) return null;
    return `https://${url.hostname}/api/${project}/envelope/`;
  } catch {
    return null;
  }
}

const answer = (status: number): Response => new Response(null, { status });

export async function forwardReport(request: Request, dsn: string | undefined, send: typeof fetch = fetch): Promise<Response> {
  const ours = ingestFor(dsn);
  // Nothing watches this environment, so there is nowhere to pass anything on to.
  if (!ours) return answer(404);

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return answer(403);

  if (Number(request.headers.get('content-length') ?? 0) > largestReport) return answer(413);
  const body = await request.text();
  if (body.length > largestReport) return answer(413);

  // A report is an envelope: its first line names the DSN it is for.
  let claimed: unknown;
  try {
    claimed = (JSON.parse(body.split('\n', 1)[0] ?? '') as { dsn?: unknown }).dsn;
  } catch {
    return answer(400);
  }
  if (typeof claimed !== 'string') return answer(400);
  if (ingestFor(claimed) !== ours) return answer(403);

  try {
    const sentry = await send(ours, { method: 'POST', body, headers: { 'content-type': 'application/x-sentry-envelope' } });
    // Sentry's reason is short and says nothing about the person: worth having in the logs when a
    // report is turned away, since nothing else would show it.
    if (!sentry.ok) console.warn(`Sentry turned a browser report away: ${String(sentry.status)} ${(await sentry.text()).slice(0, 200)}`);
    // Passed back, so the library slows down when Sentry says it is sending too much.
    return answer(sentry.status);
  } catch {
    // The page that reported is none the worse; the library tries again later.
    return answer(502);
  }
}
