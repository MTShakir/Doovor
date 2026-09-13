import { describe, expect, it, vi } from 'vitest';
import { logEmailProvider } from './log.ts';
import { resendEmailProvider } from './resend.ts';

const message = {
  to: 'learner@example.com',
  subject: 'Lesson booked',
  html: '<p>Wed 16 Sep at 09:00 with Sarah Khan.</p>',
  text: 'Wed 16 Sep at 09:00 with Sarah Khan.',
  idempotencyKey: 'booking.confirmed:b1:1:u1',
};

describe('the local provider (ARCHITECTURE 10)', () => {
  it('keeps what it would have sent and sends nothing', async () => {
    const lines: string[] = [];
    const provider = logEmailProvider({ write: (line) => lines.push(line) });

    const result = await provider.send(message);

    expect(result.ok).toBe(true);
    expect(provider.sent).toEqual([message]);
    expect(lines[0]).toBe('[email] to learner@example.com: Lesson booked');
  });
});

describe('the local provider, as it comes', () => {
  it('writes to the console when nothing else is given', async () => {
    const console_ = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = logEmailProvider();

    await provider.send(message);

    expect(console_).toHaveBeenCalledWith('[email] to learner@example.com: Lesson booked');
    console_.mockRestore();
  });
});

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A stand-in for fetch that remembers what it was asked to send. */
function recorder(body: unknown, status = 200, statusText?: string) {
  const calls: Call[] = [];
  const urlOf = (url: string | URL | Request): string =>
    typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;

  const fetchImpl = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: urlOf(url), init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, ...(statusText ? { statusText } : {}) }));
  };

  return { calls, fetchImpl };
}

const bodySent = (init: RequestInit | undefined): Record<string, unknown> =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;

const headersSent = (init: RequestInit | undefined): Record<string, string> =>
  (init?.headers ?? {}) as Record<string, string>;

describe('Resend (PRD 13)', () => {
  const from = 'Brand <hello@example.com>';

  it('sends the message and answers with the id', async () => {
    const { calls, fetchImpl } = recorder({ id: 'msg_1' });
    const provider = resendEmailProvider({ apiKey: 'key', from, fetchImpl });

    const result = await provider.send(message);

    expect(result).toEqual({ ok: true, id: 'msg_1' });
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    // The same message twice is one send (ARCHITECTURE 10).
    expect(headersSent(calls[0]?.init)['idempotency-key']).toBe('booking.confirmed:b1:1:u1');
    expect(bodySent(calls[0]?.init)).toMatchObject({
      from,
      to: ['learner@example.com'],
      subject: 'Lesson booked',
    });
  });

  it('says so rather than throwing when there is no key', async () => {
    const provider = resendEmailProvider({ apiKey: undefined, from });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'NOT_CONFIGURED',
      message: 'No Resend key is set.',
    });
  });

  it('sends replies where the brand says, and stamps nothing without a key of its own', async () => {
    const { calls, fetchImpl } = recorder({ id: 'msg_2' });
    const provider = resendEmailProvider({ apiKey: 'key', from, replyTo: 'support@example.com', fetchImpl });

    const { idempotencyKey, ...plain } = message;
    expect(idempotencyKey).not.toBe('');
    await provider.send(plain);

    expect(bodySent(calls[0]?.init)).toMatchObject({ reply_to: 'support@example.com' });
    expect(headersSent(calls[0]?.init)).not.toHaveProperty('idempotency-key');
  });

  it('tells a refusal apart from a service that is down', async () => {
    const refused = resendEmailProvider({
      apiKey: 'key',
      from,
      fetchImpl: recorder({ message: 'Invalid address' }, 422).fetchImpl,
    });
    expect(await refused.send(message)).toEqual({
      ok: false,
      reason: 'REJECTED',
      message: 'Invalid address',
    });

    const down = resendEmailProvider({
      apiKey: 'key',
      from,
      fetchImpl: recorder({ message: 'Too many requests' }, 429).fetchImpl,
    });
    expect(await down.send(message)).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('does not call a message sent when the answer has no id', async () => {
    const provider = resendEmailProvider({ apiKey: 'key', from, fetchImpl: recorder({ accepted: true }).fetchImpl });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'Resend accepted the message without an id.',
    });
  });

  it('copes with a refusal that is not JSON', async () => {
    const provider = resendEmailProvider({
      apiKey: 'key',
      from,
      fetchImpl: recorder('gateway trouble', 502, 'Bad Gateway').fetchImpl,
    });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'Bad Gateway',
    });
  });

  it('treats a network failure as worth trying again', async () => {
    const provider = resendEmailProvider({
      apiKey: 'key',
      from,
      fetchImpl: () => Promise.reject(new Error('socket hang up')),
    });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'socket hang up',
    });
  });
});
