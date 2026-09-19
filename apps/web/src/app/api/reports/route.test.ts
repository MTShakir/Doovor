import { afterEach, describe, expect, it, vi } from 'vitest';

const dsn = 'https://key@o1.ingest.de.sentry.io/2';
vi.mock('@/env/client', () => ({ clientEnv: { NEXT_PUBLIC_SENTRY_DSN: dsn } }));

const { POST } = await import('./route');
const { reportsPath } = await import('@/lib/errors/tunnel');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the browser error report route (M6-10, D-157)', () => {
  it('is where the browser library is told to send its reports', () => {
    // This file lives in app/api/reports.
    expect(reportsPath).toBe('/api/reports');
  });

  it("passes this environment's reports on to its Sentry project", async () => {
    const sent = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', sent);
    const body = [JSON.stringify({ dsn }), JSON.stringify({ type: 'event' }), JSON.stringify({ message: 'Something broke' })].join('\n');

    const answer = await POST(new Request(`https://app.example.com${reportsPath}`, { method: 'POST', headers: { origin: 'https://app.example.com' }, body }));

    expect(answer.status).toBe(200);
    expect(sent).toHaveBeenCalledWith('https://o1.ingest.de.sentry.io/api/2/envelope/', expect.objectContaining({ method: 'POST', body }));
  });

  it('turns away a report for another project without sending anything', async () => {
    const sent = vi.fn();
    vi.stubGlobal('fetch', sent);
    const body = [JSON.stringify({ dsn: 'https://key@o9.ingest.de.sentry.io/9' }), '{}', '{}'].join('\n');

    const answer = await POST(new Request(`https://app.example.com${reportsPath}`, { method: 'POST', body }));

    expect(answer.status).toBe(403);
    expect(sent).not.toHaveBeenCalled();
  });
});
