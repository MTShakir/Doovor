import 'server-only';
import { paymentsProvider, signFakeEvent, webhookSecrets } from '@/lib/payments/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface WebhookAnswer {
  status: number;
  body: unknown;
}

/**
 * What happens to an event from the payments provider (R-11, M3-03, M3-05).
 *
 * Kept apart from the route so the same path can be walked without HTTP: the signature is
 * checked on the raw body either way, and the database records and applies the event in one
 * transaction either way.
 */
export async function handleProviderEvent(input: { body: string; signature: string }): Promise<WebhookAnswer> {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    return { status: 503, body: { error: 'Webhooks are not configured' } };
  }

  const provider = paymentsProvider();
  let event = null;
  for (const secret of secrets) {
    const checked = await provider.verifyWebhook({ body: input.body, signature: input.signature, secret });
    if (checked.ok) {
      event = checked.data;
      break;
    }
  }
  if (event === null) {
    return { status: 400, body: { error: 'Bad signature' } };
  }

  const { data, error } = await getSupabaseServiceClient().rpc('system_process_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_account_id: event.accountId ?? '',
    p_payload: event.data as never,
  });

  if (error) {
    // Nothing was recorded and nothing was applied: the provider will try again.
    return { status: 500, body: { error: 'Could not process the event' } };
  }

  return { status: 200, body: data };
}

export interface FakeOutcome {
  id: string;
  accountId: string;
  amountPence: number;
  metadata: Record<string, string>;
}

/**
 * Stands in for the provider telling us how a payment went, while the fake is in use (M3-05,
 * M3-07).
 *
 * With Stripe the event arrives at the webhook route on its own. The fake has nobody to send
 * it, so this builds the event Stripe would have sent, signs it and hands it to the same handler
 * the route uses. Nothing here writes to the database itself: what is exercised is the real
 * path from an event to a lesson. Returns false with Stripe, where there is nothing to stand in
 * for.
 */
export async function deliverFakePaymentEvent(
  intent: FakeOutcome,
  outcome: 'succeeded' | 'failed',
): Promise<boolean> {
  const body = JSON.stringify({
    id: `evt_fake_${intent.id}_${outcome}`,
    type: outcome === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
    account: intent.accountId,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: intent.id,
        amount: intent.amountPence,
        amount_received: outcome === 'succeeded' ? intent.amountPence : 0,
        metadata: intent.metadata,
      },
    },
  });

  const signature = signFakeEvent(body);
  if (signature === null) return false;

  const answer = await handleProviderEvent({ body, signature });
  return answer.status === 200;
}
