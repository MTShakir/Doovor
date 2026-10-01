import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/env/server';
import { theFakeBilling } from '@/lib/billing/provider';
import { handleBillingEvent } from '@/lib/billing/webhook';
import { devRoutesOpen } from '@/lib/dev-routes';

/**
 * Stands in for Stripe's checkout page while the fake is in use (9.18, D-231).
 *
 * The fake sends the browser here instead of to Stripe. This finishes the checkout, puts the two
 * events that would follow through the real webhook handler, and sends the browser back to the
 * plan screen. So the path from the button to Pro being granted is the same path in a local run
 * as in a real one, signature check and exactly-once included, and the only thing standing in is
 * the card form.
 *
 * Not reachable in production, and never with Stripe.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!devRoutesOpen() || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return new NextResponse('Not found', { status: 404 });
  }

  const sessionId = request.nextUrl.searchParams.get('session') ?? '';
  const back = safeReturn(request.nextUrl.searchParams.get('return'));

  const done = theFakeBilling().finishCheckout(sessionId);
  if (done === null) {
    // Nothing waiting under that id: already finished, or never started. Treated like somebody
    // reloading Stripe's success page, which is to say nothing happens twice.
    return NextResponse.redirect(new URL(back, request.nextUrl.origin));
  }

  await deliver({ id: `evt_${done.subscription.id}_created`, type: 'customer.subscription.created', subscription: done.subscription, invoice: null });
  await deliver({ id: `evt_${done.invoice.id}_paid`, type: 'invoice.paid', subscription: null, invoice: done.invoice });

  return NextResponse.redirect(new URL(back, request.nextUrl.origin));
}

/** The event, signed the way the fake's own check expects, through the handler that answers Stripe. */
async function deliver(event: unknown): Promise<void> {
  await handleBillingEvent({
    body: JSON.stringify(event),
    signature: 'fake-signature',
  });
}

/**
 * Only somewhere inside this app. A redirect target from a query string is an open redirect
 * unless it is checked, dev route or not.
 */
function safeReturn(value: string | null): string {
  if (value === null) return '/app/instructor/plan';
  try {
    const url = new URL(value, 'http://localhost');
    return url.pathname.startsWith('/') && !url.pathname.startsWith('//')
      ? `${url.pathname}${url.search}`
      : '/app/instructor/plan';
  } catch {
    return '/app/instructor/plan';
  }
}
