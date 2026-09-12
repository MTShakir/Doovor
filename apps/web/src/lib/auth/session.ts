import 'server-only';
import { getAccessContext, SessionEndedError, type AccessContext } from '@repo/db';
import { headers } from 'next/headers';
import { redirectTo } from '@/lib/redirect-to';
import { cache } from 'react';
import type { Portal } from '@/lib/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canUsePortal, landingPath, needsOnboarding, requiresMfa } from './portals';

export interface Session {
  userId: string;
  email: string | null;
  aal: 'aal1' | 'aal2';
}

/**
 * The session in this request's token, or null. getClaims checks the signature only, so a
 * device signed out elsewhere still passes here: gates use getAccess, which asks the database.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const { claims } = data;
  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' && claims.email ? claims.email : null,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
  };
});

/** The session and what it may open, confirmed by the database. Null when signed out (D-041). */
export const getAccess = cache(async (): Promise<{ session: Session; access: AccessContext } | null> => {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createSupabaseServerClient();
  try {
    return { session, access: await getAccessContext(supabase, session.userId) };
  } catch (error) {
    if (error instanceof SessionEndedError) return null;
    throw error;
  }
});

/** The path of the current request, set by proxy.ts, for sign-in and MFA return links. */
export async function currentPath(): Promise<string> {
  return (await headers()).get('x-pathname') ?? '/';
}

/**
 * Gate for portal layouts. Sends signed-out people to sign in, people without this role
 * to their own portal, and staff or school owners without TOTP to /mfa (AUTH-08).
 */
export async function requirePortal(portal: Portal): Promise<{ session: Session; access: AccessContext }> {
  const path = await currentPath();
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(path)}`);
  if (requiresMfa(result.access) && result.session.aal !== 'aal2') redirectTo(`/mfa?next=${encodeURIComponent(path)}`);
  if (!canUsePortal(result.access, portal)) redirectTo(landingPath(result.access));
  if (portal === 'instructor' && needsOnboarding(result.access)) redirectTo('/onboarding');
  return result;
}

/** For pages open to any signed-in person (account, MFA, phone verification). */
export async function requireAccess(): Promise<{ session: Session; access: AccessContext }> {
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
  return result;
}

export async function requireSession(): Promise<Session> {
  return (await requireAccess()).session;
}
