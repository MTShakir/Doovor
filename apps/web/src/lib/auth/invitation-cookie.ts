import 'server-only';
import { cookies } from 'next/headers';
import { INVITATION_COOKIE } from './invitation-proxy';

/** The token the proxy remembered, if there is one. It stays until forgetInvitation. */
export async function readInvitation(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(INVITATION_COOKIE)?.value ?? null;
}

/** An invitation is accepted once, or found not to work: either way it is let go. */
export async function forgetInvitation(): Promise<void> {
  const jar = await cookies();
  jar.delete(INVITATION_COOKIE);
}
