import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { REFERRAL_COOKIE, rememberReferral } from './referral-proxy';

function codeAfter(url: string, alreadyHas = false): string | undefined {
  const response = NextResponse.next();
  rememberReferral(response, new URL(url, 'https://example.test'), alreadyHas);
  return response.cookies.get(REFERRAL_COOKIE)?.value;
}

describe('rememberReferral (D-205)', () => {
  it('keeps the code from a referral link, whatever page it pointed at', () => {
    expect(codeAfter('/start?ref=K7F2WQ9B')).toBe('K7F2WQ9B');
    expect(codeAfter('/?ref=K7F2WQ9B')).toBe('K7F2WQ9B');
    expect(codeAfter('/pricing?utm_source=x&ref=K7F2WQ9B')).toBe('K7F2WQ9B');
  });

  it('tidies a code that arrived in lower case or with spacing', () => {
    expect(codeAfter('/start?ref=k7f2wq9b')).toBe('K7F2WQ9B');
    expect(codeAfter('/start?ref=K7F2-WQ9B')).toBe('K7F2WQ9B');
  });

  it('remembers nothing without a code, or with something that is not one', () => {
    expect(codeAfter('/start')).toBeUndefined();
    expect(codeAfter('/start?ref=')).toBeUndefined();
    expect(codeAfter('/start?ref=TOOSHORT1')).toBeUndefined();
    expect(codeAfter('/start?ref=%3Cscript%3E')).toBeUndefined();
  });

  it('leaves the first link alone when a second one arrives, because that one did the work', () => {
    expect(codeAfter('/start?ref=K7F2WQ9B', true)).toBeUndefined();
  });

  it('sets a cookie the browser will not hand to a script', () => {
    const response = NextResponse.next();
    rememberReferral(response, new URL('https://example.test/start?ref=K7F2WQ9B'), false);
    const cookie = response.cookies.get(REFERRAL_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('holds it long enough to survive the email confirmation and a night thinking about it', () => {
    const response = NextResponse.next();
    rememberReferral(response, new URL('https://example.test/start?ref=K7F2WQ9B'), false);
    expect(response.cookies.get(REFERRAL_COOKIE)?.maxAge).toBe(60 * 60 * 24 * 30);
  });
});
