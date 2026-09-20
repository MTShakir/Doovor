/**
 * Checking a webhook signed the Standard Webhooks way (NFR-SEC-03, D-192).
 *
 * Supabase Auth signs the hooks it sends us with a shared secret, and so do a growing number of
 * other services, to one small specification: three headers, an HMAC over `id.timestamp.body`,
 * and a timestamp so a captured request cannot be replayed a day later.
 *
 * Nothing here is framework or Node specific, so it runs wherever the app does and is tested on
 * its own. The comparison is done in constant time: a check that returns sooner for a nearly
 * right signature tells an attacker which guess was closer.
 */

/** The three headers a signed request carries, however the server spells them. */
export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type WebhookProblem = 'NO_SIGNATURE' | 'BAD_SECRET' | 'TOO_OLD' | 'NOT_SIGNED_FOR_US';

/** How far out of step with us a signature's clock may be, either way. */
export const webhookToleranceSeconds = 300;

// Backed by a plain ArrayBuffer, so the key is a BufferSource the crypto calls take as it is.
function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The signing key from the secret as the dashboard shows it: `v1,whsec_<base64>`, or the base64
 * on its own. Anything else is not a key we can sign with.
 */
export function webhookKeyFrom(secret: string): Uint8Array<ArrayBuffer> | null {
  const trimmed = secret.trim();
  const withoutVersion = trimmed.startsWith('v1,') ? trimmed.slice(3) : trimmed;
  const raw = withoutVersion.startsWith('whsec_') ? withoutVersion.slice(6) : withoutVersion;
  if (raw === '') return null;
  try {
    const key = decodeBase64(raw);
    return key.length === 0 ? null : key;
  } catch {
    return null;
  }
}

/** Neither string tells the caller where they stopped matching. */
function sameBytes(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

/**
 * True when the body really was signed with this secret, for this id and moment. `now` is passed
 * in so the check is testable and so a screen never reads the clock for it.
 */
export async function webhookIsSigned(input: {
  headers: WebhookHeaders;
  body: string;
  secret: string;
  now: Date;
}): Promise<{ ok: true } | { ok: false; problem: WebhookProblem }> {
  const { id, timestamp, signature } = input.headers;
  if (id === null || timestamp === null || signature === null || signature.trim() === '') {
    return { ok: false, problem: 'NO_SIGNATURE' };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, problem: 'NO_SIGNATURE' };
  const drift = Math.abs(Math.floor(input.now.getTime() / 1000) - sentAt);
  if (drift > webhookToleranceSeconds) return { ok: false, problem: 'TOO_OLD' };

  const key = webhookKeyFrom(input.secret);
  if (key === null) return { ok: false, problem: 'BAD_SECRET' };

  const signer = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', signer, new TextEncoder().encode(`${id}.${timestamp}.${input.body}`));
  const ours = btoa(String.fromCharCode(...new Uint8Array(signed)));

  // A request may carry several signatures while a secret is being rotated; any one will do.
  const theirs = signature.split(' ').map((one) => (one.startsWith('v1,') ? one.slice(3) : one));
  return theirs.some((one) => sameBytes(one, ours)) ? { ok: true } : { ok: false, problem: 'NOT_SIGNED_FOR_US' };
}
