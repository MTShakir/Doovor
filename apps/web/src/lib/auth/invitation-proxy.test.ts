import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { INVITATION_COOKIE, rememberInvitation } from './invitation-proxy';

function tokenAfter(pathname: string): string | undefined {
  const response = NextResponse.next();
  rememberInvitation(response, pathname);
  return response.cookies.get(INVITATION_COOKIE)?.value;
}

describe('rememberInvitation (AUTH-07)', () => {
  it('keeps the token from an invitation link', () => {
    expect(tokenAfter('/invite/abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('reads the token as the link spelled it', () => {
    expect(tokenAfter('/invite/a%2Fb')).toBe('a/b');
  });

  it('ignores a trailing slash', () => {
    expect(tokenAfter('/invite/abc/')).toBe('abc');
  });

  it('remembers nothing for any other page', () => {
    expect(tokenAfter('/sign-up')).toBeUndefined();
    expect(tokenAfter('/invite')).toBeUndefined();
    expect(tokenAfter('/invite/abc/extra')).toBeUndefined();
  });

  it('sets a cookie the browser will not hand to a script', () => {
    const response = NextResponse.next();
    rememberInvitation(response, '/invite/abc');
    const cookie = response.cookies.get(INVITATION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });
});
