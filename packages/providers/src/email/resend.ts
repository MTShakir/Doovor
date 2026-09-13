import type { EmailMessage, EmailProvider, EmailResult } from './types.ts';

/**
 * Resend (PRD 13). Called over HTTP rather than through their package: one endpoint, three
 * fields, and one less dependency to trust with a key that can send as the brand.
 */
export interface ResendOptions {
  apiKey: string | undefined;
  /** The sender, as "Name <address>", from brand.ts. */
  from: string;
  replyTo?: string;
  baseUrl?: string;
  /** A job is waiting on this, not a person, so it can afford to be patient. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** What Resend says when it refuses. A refusal is not worth retrying; anything else is. */
function reasonFor(status: number): 'REJECTED' | 'UNAVAILABLE' {
  return status >= 400 && status < 500 && status !== 429 ? 'REJECTED' : 'UNAVAILABLE';
}

export function resendEmailProvider(options: ResendOptions): EmailProvider {
  const baseUrl = options.baseUrl ?? 'https://api.resend.com';
  const timeoutMs = options.timeoutMs ?? 10_000;
  const call = options.fetchImpl ?? fetch;

  return {
    send: async (message: EmailMessage): Promise<EmailResult> => {
      if (!options.apiKey) {
        return { ok: false, reason: 'NOT_CONFIGURED', message: 'No Resend key is set.' };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
      try {
        const response = await call(`${baseUrl}/emails`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            // The same message twice is one send, however often a job is retried.
            ...(message.idempotencyKey ? { 'idempotency-key': message.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: message.from ?? options.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ?? options.replyTo ? { reply_to: message.replyTo ?? options.replyTo } : {}),
          }),
        });

        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const said = isRecord(body) && typeof body.message === 'string' ? body.message : response.statusText;
          return { ok: false, reason: reasonFor(response.status), message: said };
        }
        const id = isRecord(body) && typeof body.id === 'string' ? body.id : '';
        return id === ''
          ? { ok: false, reason: 'UNAVAILABLE', message: 'Resend accepted the message without an id.' }
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
