import { NextResponse, type NextRequest } from 'next/server';
import { paymentsProvider, webhookSecrets } from '@/lib/payments/provider';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Events from the payments provider (R-11, PAY-08, ARCHITECTURE 8.4, M3-03).
 *
 * Two things matter here. The signature is checked on the raw body, because a body that has
 * been parsed and written out again is a different body and would never match. And recording
 * the event and applying it happen in one transaction inside the database, so the same
 * delivery arriving three times has its effect exactly once.
 *
 * The answer is 200 for anything we have understood, including a duplicate: a provider that
 * gets anything else retries, and retrying a duplicate helps nobody. Only a signature we
 * cannot verify, or a database that would not take it, gets an error.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // The raw body, before anything touches it.
  const body = await request.text();
  const provider = paymentsProvider();

  // Two endpoints share this route: the platform's own events and the connected accounts'.
  // Each is signed with its own secret, so both are tried before it is called a forgery.
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    return NextResponse.json({ error: 'Webhooks are not configured' }, { status: 503 });
  }

  let event = null;
  for (const secret of secrets) {
    const checked = await provider.verifyWebhook({ body, signature, secret });
    if (checked.ok) {
      event = checked.data;
      break;
    }
  }
  if (event === null) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  const { data, error } = await getSupabaseServiceClient().rpc('system_process_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_account_id: event.accountId ?? '',
    p_payload: event.data as never,
  });

  if (error) {
    // Nothing was recorded and nothing was applied: the provider will try again.
    return NextResponse.json({ error: 'Could not process the event' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}
