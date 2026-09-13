import 'server-only';
import { cookies } from 'next/headers';
import { INVITATION_COOKIE } from './invitation-proxy';

/** Reads the token the proxy remembered and clears it: an invitation is accepted once. */
export async function takeInvitation(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(INVITATION_COOKIE)?.value ?? null;
  if (token !== null) jar.delete(INVITATION_COOKIE);
  return token;
}
