import 'server-only';
import { brand } from '@repo/config/brand';
import { webhookIsSigned, type WebhookHeaders } from '@repo/core/standard-webhook';
import { z } from '@repo/core/zod';
import { smsProvider } from '@/lib/sms/provider';
import { serverEnv } from '@/env/server';

/**
 * The text with a sign-in code, sent by us rather than by Supabase (AUTH-02, D-192).
 *
 * Supabase Auth still makes the code, checks it and decides when to ask for one; it hands us the
 * sending. That keeps every text on the provider and in the region we choose, and puts the words
 * in the same file as the rest of the product's copy.
 *
 * The request is signed with a secret only Supabase and this app hold, and nothing is sent until
 * that signature checks out: the endpoint is public, and an unsigned request to it would be a way
 * to send texts at our expense to any number somebody liked.
 */
const askSchema = z.object({
  user: z.object({ phone: z.string().trim().min(1) }),
  sms: z.object({ otp: z.string().trim().min(1) }),
});

/** What the hook answers with: Supabase reads the status, and the body when something went wrong. */
export interface HookAnswer {
  status: number;
  body: Record<string, unknown>;
}

function refused(status: number, message: string): HookAnswer {
  return { status, body: { error: { http_code: status, message } } };
}

/** The words a learner reads. One line, the code, and who it is from. */
export function codeMessage(code: string): string {
  return `${code} is your ${brand.name} code. We will never ring you and ask for it.`;
}

export async function handleSendSmsHook(input: { body: string; headers: WebhookHeaders; now?: Date }): Promise<HookAnswer> {
  const secret = serverEnv.SUPABASE_SEND_SMS_HOOK_SECRET;
  if (!secret) {
    // Better to send nothing than to send on an unsigned say-so.
    return refused(500, 'Sending texts is not set up here.');
  }

  const signed = await webhookIsSigned({ headers: input.headers, body: input.body, secret, now: input.now ?? new Date() });
  if (!signed.ok) return refused(401, 'That request was not signed by us.');

  const parsed = askSchema.safeParse(JSON.parse(input.body) as unknown);
  if (!parsed.success) return refused(400, 'That is not a request to send a code.');

  const sent = await smsProvider().send({ to: parsed.data.user.phone, body: codeMessage(parsed.data.sms.otp) });
  if (!sent.ok) {
    // The provider's own words, which is what tells anybody looking why no code arrived. A
    // refusal is the number or the account, and is not worth Supabase trying again.
    const status = sent.reason === 'REJECTED' ? 422 : 502;
    return refused(status, sent.message);
  }

  return { status: 200, body: {} };
}
