import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './reporting';

/** An error report as Sentry would send it, before we have read it. */
function report(parts: Partial<ErrorEvent>): ErrorEvent {
  return { event_id: 'e1', ...parts } as ErrorEvent;
}

describe('what an error report may carry (NFR-SEC-03, M6-10)', () => {
  it('keeps the screen and drops the query, which can carry a token', () => {
    const scrubbed = scrubEvent(
      report({
        request: { url: 'https://example.test/invite/abc?token=secret-invitation', query_string: 'token=secret-invitation' },
      }),
    );
    expect(scrubbed.request?.url).toBe('https://example.test/invite/abc');
    expect(scrubbed.request?.query_string).toBeUndefined();
  });

  it('drops the cookies and the body outright', () => {
    const scrubbed = scrubEvent(
      report({ request: { url: 'https://example.test/sign-in', cookies: { session: 'a-real-session' }, data: { password: 'hunter2' } } }),
    );
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
  });

  it('removes a header whose name says it is a secret, and keeps the rest', () => {
    const scrubbed = scrubEvent(
      report({
        request: {
          url: 'https://example.test/',
          headers: { authorization: 'Bearer abc', cookie: 'session=abc', 'user-agent': 'Firefox', 'accept-language': 'en-GB' },
        },
      }),
    );
    expect(scrubbed.request?.headers).toEqual({
      authorization: '[removed]',
      cookie: '[removed]',
      'user-agent': 'Firefox',
      'accept-language': 'en-GB',
    });
  });

  it('keeps only the account id of whoever it happened to', () => {
    const scrubbed = scrubEvent(report({ user: { id: 'account-1', email: 'somebody@example.test', ip_address: '1.2.3.4' } }));
    expect(scrubbed.user).toEqual({ id: 'account-1' });
  });

  it('says nothing about a person when it does not know who they are', () => {
    const scrubbed = scrubEvent(report({ user: { email: 'somebody@example.test' } }));
    expect(scrubbed.user).toEqual({});
  });

  it('removes anything a developer attached under a telling name', () => {
    const scrubbed = scrubEvent(
      report({ extra: { bookingId: 'b1', otp: '123456', licenceNumber: 'SMITH123' }, tags: { screen: 'diary', session_token: 'abc' } }),
    );
    expect(scrubbed.extra).toEqual({ bookingId: 'b1', otp: '[removed]', licenceNumber: '[removed]' });
    expect(scrubbed.tags).toEqual({ screen: 'diary', session_token: '[removed]' });
  });

  it('leaves a report that carries nothing alone', () => {
    expect(scrubEvent(report({}))).toEqual({ event_id: 'e1' });
  });
});
