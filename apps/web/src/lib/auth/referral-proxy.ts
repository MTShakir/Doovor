import { normaliseReferralCode } from '@repo/core/referral';
import type { NextResponse } from 'next/server';

/**
 * A referral link opened before signing up has to survive the sign-up and the email confirmation
 * that follows (D-205), exactly as an invitation does (AUTH-07). The code rides in a cookie of its
 * own rather than in a redirect, so it cannot end up in a link somebody shares by accident.
 *
 * It is set here rather than by the page because a Server Component render may not write cookies.
 * The proxy sees the request first, so the code is remembered before the page runs.
 */
export const REFERRAL_COOKIE = 'referral';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Remembers the code in a referral link a signed-out visitor has just opened, on whatever page it
 * pointed at. The first link wins: somebody who arrives on one and then wanders in through another
 * is still the first instructor's referral, which is the one who did the work.
 */
export function rememberReferral(response: NextResponse, url: URL, alreadyHas: boolean): void {
  if (alreadyHas) return;
  const code = normaliseReferralCode(url.searchParams.get('ref') ?? '');
  if (code === '') return;

  response.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS,
  });
}
