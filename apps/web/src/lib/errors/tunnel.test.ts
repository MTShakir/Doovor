import { describe, expect, it, vi } from 'vitest';
import { forwardReport, reportsPath } from './tunnel';

const dsn = 'https://publickey@o123.ingest.de.sentry.io/456';
const ingest = 'https://o123.ingest.de.sentry.io/api/456/envelope/';

/** A report as the browser library sends it: a header line naming the DSN, then the event. */
function envelope(claimedDsn = dsn, event: object = { message: 'Something broke' }): string {
  return [JSON.stringify({ dsn: claimedDsn, sent_at: '2026-09-19T01:00:00.000Z' }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.example.com${reportsPath}`, {
    method: 'POST',
    headers: {
      origin: 'https://app.example.com',
      'content-type': 'text/plain;charset=UTF-8',
      cookie: 'sb-access-token=secret',
      'x-forwarded-for': '203.0.113.7',
      'user-agent': 'Mozilla/5.0',
      ...headers,
    },
    body,
  });
}

describe('passing browser error reports on to Sentry (M6-10, D-157)', () => {
  it('sends our own project a report, and nothing of the person who sent it', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const body = envelope();

    const answer = await forwardReport(post(body), dsn, send);

    expect(answer.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ingest);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    // Only what Sentry needs to read the body: no cookie, no address, no browser, so the report
    // arrives from our server and Sentry never learns where the person was.
    expect(init.headers).toEqual({ 'content-type': 'application/x-sentry-envelope' });
  });

  it('passes on what Sentry answered, so the library can back off when told to', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    expect((await forwardReport(post(envelope()), dsn, send)).status).toBe(429);
  });

  it('refuses a report meant for any other project, so it cannot be used to reach one', async () => {
    const send = vi.fn();
    for (const other of ['https://key@o999.ingest.de.sentry.io/456', 'https://key@o123.ingest.de.sentry.io/789', 'https://key@evil.example.com/456']) {
      expect((await forwardReport(post(envelope(other)), dsn, send)).status).toBe(403);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a report sent from another site', async () => {
    const send = vi.fn();
    expect((await forwardReport(post(envelope(), { origin: 'https://elsewhere.example' }), dsn, send)).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a body larger than an error report is', async () => {
    const send = vi.fn();
    const huge = envelope(dsn, { message: 'x'.repeat(1_100_000) });
    expect((await forwardReport(post(huge), dsn, send)).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses something that is not a report', async () => {
    const send = vi.fn();
    for (const body of ['', 'not json at all', JSON.stringify({ no: 'dsn' })]) {
      expect((await forwardReport(post(body), dsn, send)).status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('answers that nothing is here when this environment reports nowhere', async () => {
    const send = vi.fn();
    expect((await forwardReport(post(envelope()), undefined, send)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps quiet if Sentry cannot be reached, rather than failing the page that reported', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'));
    expect((await forwardReport(post(envelope()), dsn, send)).status).toBe(502);
  });
});
