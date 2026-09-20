import { describe, expect, it } from 'vitest';
import { webhookIsSigned, webhookKeyFrom, webhookToleranceSeconds } from './standard-webhook.ts';

const secret = 'v1,whsec_c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5';
const body = JSON.stringify({ user: { phone: '+447700900001' }, sms: { otp: '123456' } });
const id = 'msg_2abc';
const now = new Date('2026-09-20T12:00:00Z');
const stamp = String(Math.floor(now.getTime() / 1000));

/** Signs the way the sender does, so the test never hard-codes a signature to drift from. */
async function sign(over: string, key = secret): Promise<string> {
  const bytes = webhookKeyFrom(key);
  if (bytes === null) throw new Error('That secret has no key in it');
  const signer = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', signer, new TextEncoder().encode(over));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signed)))}`;
}

describe('a webhook signed the Standard Webhooks way (NFR-SEC-03, D-192)', () => {
  it('takes one signed with the secret we share', async () => {
    const signature = await sign(`${id}.${stamp}.${body}`);
    expect(await webhookIsSigned({ headers: { id, timestamp: stamp, signature }, body, secret, now })).toEqual({ ok: true });
  });

  it('refuses one signed with another secret', async () => {
    const signature = await sign(`${id}.${stamp}.${body}`, 'v1,whsec_YW5vdGhlci1rZXktZW50aXJlbHktaGVyZQ==');
    const checked = await webhookIsSigned({ headers: { id, timestamp: stamp, signature }, body, secret, now });
    expect(checked).toEqual({ ok: false, problem: 'NOT_SIGNED_FOR_US' });
  });

  it('refuses a body that changed after it was signed', async () => {
    const signature = await sign(`${id}.${stamp}.${body}`);
    const tampered = body.replace('123456', '999999');
    const checked = await webhookIsSigned({ headers: { id, timestamp: stamp, signature }, body: tampered, secret, now });
    expect(checked).toEqual({ ok: false, problem: 'NOT_SIGNED_FOR_US' });
  });

  it('refuses one replayed later, and takes one a little out of step', async () => {
    const signature = await sign(`${id}.${stamp}.${body}`);
    const headers = { id, timestamp: stamp, signature };
    const late = new Date(now.getTime() + (webhookToleranceSeconds + 1) * 1000);
    expect(await webhookIsSigned({ headers, body, secret, now: late })).toEqual({ ok: false, problem: 'TOO_OLD' });

    const soon = new Date(now.getTime() + (webhookToleranceSeconds - 1) * 1000);
    expect(await webhookIsSigned({ headers, body, secret, now: soon })).toEqual({ ok: true });
  });

  it('refuses one with nothing to check', async () => {
    const headers = { id: null, timestamp: stamp, signature: 'v1,anything' };
    expect(await webhookIsSigned({ headers, body, secret, now })).toEqual({ ok: false, problem: 'NO_SIGNATURE' });
    expect(await webhookIsSigned({ headers: { id, timestamp: stamp, signature: '' }, body, secret, now })).toEqual({
      ok: false,
      problem: 'NO_SIGNATURE',
    });
  });

  it('says so when the secret is not one we can sign with', async () => {
    const signature = await sign(`${id}.${stamp}.${body}`);
    const checked = await webhookIsSigned({ headers: { id, timestamp: stamp, signature }, body, secret: 'v1,whsec_', now });
    expect(checked).toEqual({ ok: false, problem: 'BAD_SECRET' });
  });

  it('takes any one of several signatures, so a secret can be changed without dropping hooks', async () => {
    const ours = await sign(`${id}.${stamp}.${body}`);
    const other = await sign(`${id}.${stamp}.${body}`, 'v1,whsec_YW5vdGhlci1rZXktZW50aXJlbHktaGVyZQ==');
    const signature = `${other} ${ours}`;
    expect(await webhookIsSigned({ headers: { id, timestamp: stamp, signature }, body, secret, now })).toEqual({ ok: true });
  });

  it('reads the secret however it is written down', () => {
    const base64 = 'c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5';
    expect(webhookKeyFrom(`v1,whsec_${base64}`)).toEqual(webhookKeyFrom(base64));
    expect(webhookKeyFrom(`whsec_${base64}`)).toEqual(webhookKeyFrom(base64));
    expect(webhookKeyFrom('   ')).toBeNull();
  });
});
