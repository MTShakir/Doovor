import { NextResponse, type NextRequest } from 'next/server';
import { getAppUrl } from '@/lib/app-url';
import { fakeOnboarding } from '@/lib/payments/provider';

/**
 * Stands in for the provider's onboarding pages while the fake provider is in use (M3-02).
 *
 * Local runs and the end to end suite walk the whole connect flow this way: the account is
 * marked as finished and the browser goes back where the provider would have sent it. It is
 * not reachable in production, and it can only ever touch the in-memory fake.
 */
export function GET(request: NextRequest): NextResponse {
  if (process.env.APP_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const accountId = request.nextUrl.searchParams.get('account') ?? '';
  const back = request.nextUrl.searchParams.get('return') ?? `${getAppUrl()}/app/instructor/money`;
  const finished = fakeOnboarding(accountId);

  // Only ever back into this app, whatever the query string says.
  const target = new URL(back, getAppUrl());
  if (target.origin !== new URL(getAppUrl()).origin) {
    return NextResponse.redirect(new URL('/app/instructor/money', getAppUrl()));
  }
  target.searchParams.set('connected', finished ? '1' : '0');
  return NextResponse.redirect(target);
}
