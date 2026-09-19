import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
vi.mock('@sentry/nextjs', () => ({ init: (options: unknown) => { init(options); } }));

const { watchForErrors } = await import('./sentry');

beforeEach(() => {
  init.mockClear();
});

describe('starting the error reporter (M6-10)', () => {
  it('does nothing at all without a DSN', async () => {
    await watchForErrors(undefined, 'local');
    expect(init).not.toHaveBeenCalled();
  });

  it('sends a browser report through our own server when told to, so Sentry never sees the visitor (D-157)', async () => {
    await watchForErrors('https://key@o1.ingest.de.sentry.io/2', 'app.example.com', { tunnel: '/api/reports' });
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ tunnel: '/api/reports', environment: 'app.example.com', sendDefaultPii: false }));
  });

  it('sends straight to Sentry from the server, which is the only address Sentry then sees', async () => {
    await watchForErrors('https://key@o1.ingest.de.sentry.io/2', 'preview');
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]?.[0]).not.toHaveProperty('tunnel');
  });
});
