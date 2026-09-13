import { NextResponse, type NextRequest } from 'next/server';
import { handleProviderEvent } from '@/lib/payments/webhook';

/**
 * Events from the payments provider (R-11, PAY-08, ARCHITECTURE 8.4, M3-03).
 *
 * The signature is checked on the raw body, because a body that has been parsed and written
 * out again is a different body and would never match. Everything else happens in
 * `handleProviderEvent`, which the test card path uses too.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // The raw body, before anything touches it.
  const body = await request.text();
  const answer = await handleProviderEvent({ body, signature });
  return NextResponse.json(answer.body, { status: answer.status });
}
