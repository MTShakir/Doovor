import type { SmsMessage, SmsProvider, SmsResult } from './types.ts';

/**
 * Twilio (PRD 13). Over HTTP rather than through their package, for the same reason as email:
 * one endpoint, three fields, and one less dependency holding credentials that can send as us.
 */
export interface TwilioOptions {
  accountSid: string | undefined;
  authToken: string | undefined;
  /** The Messaging Service that owns the sender ID and the geo permissions. */
  messagingServiceSid: string | undefined;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A refusal is not worth retrying; anything else is. */
function reasonFor(status: number): 'REJECTED' | 'UNAVAILABLE' {
  return status >= 400 && status < 500 && status !== 429 ? 'REJECTED' : 'UNAVAILABLE';
}

export function twilioSmsProvider(options: TwilioOptions): SmsProvider {
  const baseUrl = options.baseUrl ?? 'https://api.twilio.com';
  const timeoutMs = options.timeoutMs ?? 10_000;
  const call = options.fetchImpl ?? fetch;

  return {
    send: async (message: SmsMessage): Promise<SmsResult> => {
      const { accountSid, authToken, messagingServiceSid } = options;
      if (!accountSid || !authToken || !messagingServiceSid) {
        return { ok: false, reason: 'NOT_CONFIGURED', message: 'Twilio is not set up here.' };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
      try {
        const response = await call(`${baseUrl}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            MessagingServiceSid: messagingServiceSid,
            To: message.to,
            Body: message.body,
          }).toString(),
        });

        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const said = isRecord(body) && typeof body.message === 'string' ? body.message : response.statusText;
          return { ok: false, reason: reasonFor(response.status), message: said };
        }
        const id = isRecord(body) && typeof body.sid === 'string' ? body.sid : '';
        return id === ''
          ? { ok: false, reason: 'UNAVAILABLE', message: 'Twilio accepted the message without an id.' }
          : { ok: true, id };
      } catch (error) {
        const said = error instanceof Error ? error.message : 'The request failed.';
        return { ok: false, reason: 'UNAVAILABLE', message: said };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
