import 'server-only';
import { cookies } from 'next/headers';
import { REFERRAL_COOKIE } from './referral-proxy';

/** The code the proxy remembered, if there is one. It stays until forgetReferral. */
export async function readReferral(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFERRAL_COOKIE)?.value ?? null;
}

/** A referral is recorded once, or found to be nobody's: either way it is let go. */
export async function forgetReferral(): Promise<void> {
  const jar = await cookies();
  jar.delete(REFERRAL_COOKIE);
}
