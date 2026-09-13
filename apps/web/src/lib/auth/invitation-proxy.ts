import type { NextResponse } from 'next/server';

/**
 * An invitation opened before signing up has to survive the sign-up and the email
 * confirmation that follows (AUTH-07, M2-03). The token rides in a cookie of its own: it is
 * never written into a redirect, so it cannot end up in a link someone shares by accident.
 *
 * It is set here rather than by the page because a Server Component render may not write
 * cookies. The proxy sees the request first, so the token is remembered before the page runs.
 */
export const INVITATION_COOKIE = 'invitation';

const ONE_DAY = 60 * 60 * 24;
const INVITE_PATH = /^\/invite\/([^/]+)\/?$/;

/** Remembers the token in an invitation link a signed-out visitor has just opened. */
export function rememberInvitation(response: NextResponse, pathname: string): void {
  const token = INVITE_PATH.exec(pathname)?.[1];
  if (token === undefined) return;

  response.cookies.set(INVITATION_COOKIE, decodeURIComponent(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_DAY,
  });
}
