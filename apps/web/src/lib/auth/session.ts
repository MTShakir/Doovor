import 'server-only';
import { formatTime } from '@repo/core/time';
import { getAccessContext, SessionEndedError, type AccessContext } from '@repo/db';
import { headers } from 'next/headers';
import { redirectTo } from '@/lib/redirect-to';
import { cache } from 'react';
import { z } from '@repo/core/zod';
import { viewingId } from './view-as';
import type { Portal } from '@/lib/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canUsePortal, landingPath, needsLearnerOnboarding, needsOnboarding, needsSchoolOnboarding, requiresMfa } from './portals';

/** Platform staff viewing as somebody, read only (ADM-06, D-129). */
export interface ViewingAs {
  viewingId: string;
  /** Whom they view as. */
  name: string;
  staffName: string;
  /** "14:30": when the viewing ends by itself. */
  endsAt: string;
}

export interface Session {
  /** Whom the request is for: the person viewed, while staff view as somebody. */
  userId: string;
  email: string | null;
  aal: 'aal1' | 'aal2';
  viewingAs: ViewingAs | null;
}

const viewingSchema = z.object({
  viewing: z.string(),
  user_id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  staff_name: z.string(),
  expires_at: z.string(),
});

/**
 * The session in this request's token, or null. getClaims checks the signature only, so a
 * device signed out elsewhere still passes here: gates use getAccess, which asks the database.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const { claims } = data;
  const own: Session = {
    userId: claims.sub,
    email: typeof claims.email === 'string' && claims.email ? claims.email : null,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    viewingAs: null,
  };
  if ((await viewingId()) === null) return own;

  // The database honours a viewing only for the staff session that started it, and says whom it
  // views; one that has ended sends the browser to forget it (ADM-06, D-129).
  const context = await supabase.rpc('impersonation_context');
  if (context.error || context.data === null) redirectTo('/view-as/ended');
  const viewing = viewingSchema.parse(context.data);
  return {
    userId: viewing.user_id,
    email: viewing.email,
    // The person's own second step is not asked for: the staff member passed theirs to start viewing.
    aal: 'aal1',
    viewingAs: {
      viewingId: viewing.viewing,
      name: viewing.name,
      staffName: viewing.staff_name,
      endsAt: formatTime(new Date(viewing.expires_at)),
    },
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
  if (requiresMfa(result.access) && result.session.aal !== 'aal2' && result.session.viewingAs === null) {
    redirectTo(`/mfa?next=${encodeURIComponent(path)}`);
  }
  if (!canUsePortal(result.access, portal)) redirectTo(landingPath(result.access));
  if (portal === 'school' && needsSchoolOnboarding(result.access)) redirectTo('/onboarding/school');
  if (portal === 'instructor' && needsOnboarding(result.access)) redirectTo('/onboarding');
  if (portal === 'learner' && needsLearnerOnboarding(result.access)) redirectTo('/onboarding/about-you');
  return result;
}

/** For pages open to any signed-in person (account, MFA, phone verification). */
export async function requireAccess(): Promise<{ session: Session; access: AccessContext }> {
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
  // Staff viewing as somebody see their portals, not their account, devices or verification (D-129).
  if (result.session.viewingAs) redirectTo(landingPath(result.access));
  return result;
}

export async function requireSession(): Promise<Session> {
  return (await requireAccess()).session;
}
