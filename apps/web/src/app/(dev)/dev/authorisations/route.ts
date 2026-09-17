import { NextResponse } from 'next/server';
import { serverEnv } from '@/env/server';
import { settleAuthorisations } from '@/jobs/authorisations';
import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Runs the sweep that takes or releases authorised cards, in this process, while the fake
 * provider is in use (M3-08).
 *
 * The job runner is not part of a local end to end run, and the fake keeps its payments in this
 * process, so this is how a test walks from an instructor accepting a request to the money being
 * taken. It does only what the five minute sweep would do anyway. Not reachable in production,
 * and never with Stripe.
 */
export async function POST(): Promise<NextResponse> {
  if (!devRoutesOpen() || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.json(await settleAuthorisations());
}
