import 'server-only';
import { paymentsProvider, webhookSecrets } from '@/lib/payments/provider';
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
