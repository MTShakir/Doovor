import { describe, expect, it, vi } from 'vitest';
import { logSmsProvider } from './log.ts';
import { twilioSmsProvider } from './twilio.ts';

const message = { to: '+447700900123', body: 'Lesson tomorrow. Wed 16 Sep at 09:00 with Sarah Khan.' };

interface Call {
  url: string;
  init: RequestInit | undefined;
}

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

const fieldsSent = (init: RequestInit | undefined): URLSearchParams =>
  new URLSearchParams(typeof init?.body === 'string' ? init.body : '');

describe('the local provider (ARCHITECTURE 10)', () => {
  it('keeps what it would have sent and sends nothing', async () => {
    const lines: string[] = [];
    const provider = logSmsProvider({ write: (line) => lines.push(line) });

    const result = await provider.send(message);

    expect(result.ok).toBe(true);
    expect(provider.sent).toEqual([message]);
    expect(lines[0]).toContain('[sms] to +447700900123');
  });

  it('writes to the console when nothing else is given', async () => {
    const console_ = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await logSmsProvider().send(message);
    expect(console_).toHaveBeenCalled();
    console_.mockRestore();
  });
});

describe('Twilio (PRD 13)', () => {
  const credentials = { accountSid: 'AC123', authToken: 'secret', messagingServiceSid: 'MG123' };

  it('sends through the messaging service that owns the sender', async () => {
    const { calls, fetchImpl } = recorder({ sid: 'SM1' });
    const provider = twilioSmsProvider({ ...credentials, fetchImpl });

    const result = await provider.send(message);

    expect(result).toEqual({ ok: true, id: 'SM1' });
    expect(calls[0]?.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    const fields = fieldsSent(calls[0]?.init);
    expect(fields.get('MessagingServiceSid')).toBe('MG123');
    expect(fields.get('To')).toBe('+447700900123');
    expect(fields.get('Body')).toBe(message.body);
  });

  it('says so rather than throwing when it is not set up', async () => {
    const provider = twilioSmsProvider({ ...credentials, authToken: undefined });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'NOT_CONFIGURED',
      message: 'Twilio is not set up here.',
    });
  });

  it('tells a refused number apart from a service that is down', async () => {
    const refused = twilioSmsProvider({
      ...credentials,
      fetchImpl: recorder({ message: 'The To number is not valid' }, 400).fetchImpl,
    });
    expect(await refused.send(message)).toEqual({
      ok: false,
      reason: 'REJECTED',
      message: 'The To number is not valid',
    });

    const down = twilioSmsProvider({ ...credentials, fetchImpl: recorder({ message: 'Slow down' }, 429).fetchImpl });
    expect(await down.send(message)).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('does not call a message sent when the answer has no id', async () => {
    const provider = twilioSmsProvider({ ...credentials, fetchImpl: recorder({ status: 'queued' }).fetchImpl });
    expect(await provider.send(message)).toMatchObject({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('copes with an answer that is not JSON', async () => {
    const provider = twilioSmsProvider({
      ...credentials,
      fetchImpl: recorder('gateway trouble', 502, 'Bad Gateway').fetchImpl,
    });
    expect(await provider.send(message)).toEqual({ ok: false, reason: 'UNAVAILABLE', message: 'Bad Gateway' });
  });

  it('treats a network failure as worth trying again', async () => {
    const provider = twilioSmsProvider({
      ...credentials,
      fetchImpl: () => Promise.reject(new Error('socket hang up')),
    });
    expect(await provider.send(message)).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'socket hang up',
    });
  });
});
