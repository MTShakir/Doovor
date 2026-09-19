import { readFileSync } from 'node:fs';
import path from 'node:path';
import { passwordMinLength } from '@repo/core/schemas/auth';
import { describe, expect, it } from 'vitest';

const root = path.join(import.meta.dirname, '..', '..', '..');

/** The numbers under one heading of a config.toml, without a TOML parser for five integers. */
function section(file: string, heading: string): Record<string, number> {
  const text = readFileSync(path.join(root, file), 'utf8');
  const after = text.split(`[${heading}]`)[1] ?? '';
  const lines = after.split('\n').slice(1);
  const numbers: Record<string, number> = {};
  for (const line of lines) {
    if (line.startsWith('[')) break;
    const match = /^\s*(\w+)\s*=\s*(\d+)/.exec(line);
    if (match?.[1] && match[2]) numbers[match[1]] = Number(match[2]);
  }
  return numbers;
}

/**
 * Supabase Auth counts sign-ins, codes and emails itself, and the numbers live in the hosted
 * config that `supabase config push` applies (RUNBOOK 3.1 step 6). A test rather than a comment,
 * so nobody raises them to the local ones by mistake (NFR-SEC-03, M6-03).
 */
describe('what Auth allows an hour on the hosted project', () => {
  const hosted = section('ops/staging/supabase/config.toml', 'auth.rate_limit');

  it('counts sign-ins, verifications, refreshes, emails and texts', () => {
    expect(Object.keys(hosted).sort()).toEqual(['email_sent', 'sign_in_sign_ups', 'sms_sent', 'token_refresh', 'token_verifications']);
  });

  it('keeps every one of them to a person, not a script', () => {
    expect(hosted.sign_in_sign_ups).toBeLessThanOrEqual(60);
    expect(hosted.token_verifications).toBeLessThanOrEqual(60);
    expect(hosted.email_sent).toBeLessThanOrEqual(60);
    // Texts cost money and go to one number at a time.
    expect(hosted.sms_sent).toBeLessThanOrEqual(30);
    // Refreshes happen on their own, so this one is larger, and still finite.
    expect(hosted.token_refresh).toBeGreaterThan(0);
    expect(hosted.token_refresh).toBeLessThanOrEqual(300);
  });

  it('leaves the local stack room for the end to end runs, which sign in hundreds of times', () => {
    const local = section('supabase/config.toml', 'auth.rate_limit');
    expect(local.sign_in_sign_ups).toBeGreaterThan(hosted.sign_in_sign_ups ?? 0);
  });
});

/**
 * The shortest password, which Supabase Auth checks as well as the app's own forms (D-161). If the
 * two differ, the one that is longer turns people away with a message the other never showed.
 */
describe('the shortest password anybody can choose', () => {
  it('is the same in the app, on the hosted project and on the local stack', () => {
    expect(passwordMinLength).toBe(10);
    expect(section('ops/staging/supabase/config.toml', 'auth').minimum_password_length).toBe(passwordMinLength);
    expect(section('supabase/config.toml', 'auth').minimum_password_length).toBe(passwordMinLength);
  });
});
