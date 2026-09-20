import { webhookKeyFrom } from '@repo/core/standard-webhook';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secret = 'v1,whsec_c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5';
const sent: { to: string; body: string }[] = [];
let answer: { ok: boolean; reason?: string; message?: string; id?: string } = { ok: true, id: 'SM1' };

vi.mock('@/env/server', () => ({ serverEnv: { SUPABASE_SEND_SMS_HOOK_SECRET: secret } }));
vi.mock('@/lib/sms/provider', () => ({
  smsProvider: () => ({
    send: (message: { to: string; body: string }) => {
      sent.push(message);
      return Promise.resolve(answer);
    },
  }),
}));

const { codeMessage, handleSendSmsHook } = await import('./send-sms-hook');

const now = new Date('2026-09-20T12:00:00Z');
const stamp = String(Math.floor(now.getTime() / 1000));
const id = 'msg_1';

async function signedHeaders(body: string, key = secret): Promise<{ id: string; timestamp: string; signature: string }> {
  const bytes = webhookKeyFrom(key);
  if (bytes === null) throw new Error('That secret has no key in it');
  const signer = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', signer, new TextEncoder().encode(`${id}.${stamp}.${body}`));
  return { id, timestamp: stamp, signature: `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}` };
}

const ask = JSON.stringify({ user: { phone: '+447700900001' }, sms: { otp: '123456' } });

describe('sending a sign-in code ourselves (AUTH-02, D-192)', () => {
  beforeEach(() => {
    sent.length = 0;
    answer = { ok: true, id: 'SM1' };
  });

  it('sends the code to the number Supabase gives, in our own words', async () => {
    const result = await handleSendSmsHook({ body: ask, headers: await signedHeaders(ask), now });
    expect(result.status).toBe(200);
    expect(sent).toEqual([{ to: '+447700900001', body: codeMessage('123456') }]);
    expect(codeMessage('123456')).toContain('123456');
  });

  it('sends nothing at all for a request that is not signed by us', async () => {
    const headers = await signedHeaders(ask, 'v1,whsec_YW5vdGhlci1rZXktZW50aXJlbHktaGVyZQ==');
    const result = await handleSendSmsHook({ body: ask, headers, now });
    expect(result.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('sends nothing for a body changed after it was signed', async () => {
    const headers = await signedHeaders(ask);
    const result = await handleSendSmsHook({ body: ask.replace('447700900001', '447700900009'), headers, now });
    expect(result.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('refuses a signed request that is not asking for a code', async () => {
    const body = JSON.stringify({ user: { phone: '+447700900001' } });
    const result = await handleSendSmsHook({ body, headers: await signedHeaders(body), now });
    expect(result.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('passes on what the provider said, and tells Supabase whether trying again would help', async () => {
    answer = { ok: false, reason: 'REJECTED', message: 'The number is not a mobile.' };
    const refused = await handleSendSmsHook({ body: ask, headers: await signedHeaders(ask), now });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain('The number is not a mobile.');

    answer = { ok: false, reason: 'UNAVAILABLE', message: 'Twilio did not answer.' };
    const later = await handleSendSmsHook({ body: ask, headers: await signedHeaders(ask), now });
    expect(later.status).toBe(502);
  });
});
