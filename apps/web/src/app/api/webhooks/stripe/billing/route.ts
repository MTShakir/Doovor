import { NextResponse, type NextRequest } from 'next/server';
import { handleBillingEvent } from '@/lib/billing/webhook';

/**
 * Events from Stripe Billing: a Business paying us for Pro (9.18, D-231, D-235).
 *
 * A separate endpoint from `/api/webhooks/stripe`, which takes events on connected accounts and
 * is about learners paying Businesses. These are events on the platform's own account, so they
 * carry the platform signing secret and nothing from a connected account is accepted here
 * (RUNBOOK 3.7 step 7a).
 *
 * The signature is checked on the raw body, because a body that has been parsed and written out
 * again is a different body and would never match.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  const body = await request.text();
  const answer = await handleBillingEvent({ body, signature });
  return NextResponse.json(answer.body, { status: answer.status });
}
