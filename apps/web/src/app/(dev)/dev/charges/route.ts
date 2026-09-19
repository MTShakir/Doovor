import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/env/server';
import { chargeBeforeLessons } from '@/jobs/charges';
import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Runs the charge the day before a lesson, in this process, while the fake provider is in use
 * (M3-09).
 *
 * The job runner is not part of a local end to end run, and a test cannot wait a day, so a test
 * may widen the window it charges in. It does only what the ten minute job would do for
 * lessons in that window. On a developer's machine and in the test runs only, and never with Stripe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!devRoutesOpen() || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return new NextResponse('Not found', { status: 404 });
  }
  const within = Number(request.nextUrl.searchParams.get('within') ?? '24');
  const withinHours = Number.isInteger(within) && within > 0 ? within : 24;
  return NextResponse.json(await chargeBeforeLessons({ withinHours }));
}
