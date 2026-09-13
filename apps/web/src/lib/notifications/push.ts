import 'server-only';
import webpush from 'web-push';
import { serverEnv } from '@/env/server';

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  /** Two pushes about the same lesson replace each other rather than stacking up. */
  tag?: string;
}

export type PushOutcome =
  | { ok: true }
  /** The browser is gone: the subscription should be forgotten rather than retried. */
  | { ok: false; gone: true; message: string }
  | { ok: false; gone: false; message: string };

let configured = false;

/** True when this environment has keys to sign a push with (NTF-01). */
export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && serverEnv.VAPID_PRIVATE_KEY);
}

function ready(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      serverEnv.VAPID_SUBJECT ?? 'mailto:support@example.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
      serverEnv.VAPID_PRIVATE_KEY ?? '',
    );
    configured = true;
  }
  return true;
}

/**
 * One push, to one browser (NTF-01, M2-29). The payload is encrypted with the browser's own
 * keys, so the push service carries it without being able to read it.
 */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  if (!ready()) return { ok: false, gone: false, message: 'Push is not configured here.' };

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 },
    );
    return { ok: true };
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : null;
    const message = error instanceof Error ? error.message : 'The push service refused it.';
    return { ok: false, gone: status === 404 || status === 410, message };
  }
}
