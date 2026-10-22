import 'server-only';
import { termsVersion } from '@repo/core/legal';
import { formatTime } from '@repo/core/time';
import { getAccessContext, SessionEndedError, type AccessContext } from '@repo/db';
import { headers } from 'next/headers';
import { redirectTo } from '@/lib/redirect-to';
import { cache } from 'react';
import { z } from '@repo/core/zod';
import { viewingId } from './view-as';
import { portalRoots, type Portal } from '@/lib/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canUsePortal, landingPath, needsLearnerOnboarding, needsOnboarding, needsSchoolOnboarding, secondStepRequired } from './portals';

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

/** Which version of the terms somebody agreed to, or null: read once a request (D-265). */
const agreedTermsVersion = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('users').select('terms_version').eq('id', userId).maybeSingle();
  return data?.terms_version ?? null;
});

/**
 * Whether somebody still has to agree to the current terms and privacy notice (NFR-PRV-02, D-265).
 * Staff are not asked, and nor is staff viewing as somebody: the terms are between the product and
 * the people who use it, and a viewing changes nothing.
 */
export async function needsToAgree(result: { session: Session; access: AccessContext }): Promise<boolean> {
  if (result.session.viewingAs !== null || result.access.staffRole !== null) return false;
  return (await agreedTermsVersion(result.session.userId)) !== termsVersion;
}

/**
 * Sends somebody who has not agreed to the current terms to agree before anything of theirs opens:
 * someone who signed up with Google or Apple, someone an instructor added, an account from before
 * the terms were asked for, or anybody after the terms change (D-265).
 */
export async function requireAgreedTerms(result: { session: Session; access: AccessContext }, path: string): Promise<void> {
  if (await needsToAgree(result)) redirectTo(`/agree?next=${encodeURIComponent(path)}`);
}

/** The path of the current request, set by proxy.ts, for sign-in and MFA return links. */
export async function currentPath(): Promise<string> {
  return (await headers()).get('x-pathname') ?? '/';
}

/**
 * Gate for portal layouts. Sends signed-out people to sign in, people without this role
 * to their own portal, and staff or school owners without TOTP to /mfa (AUTH-08).
 *
 * An action two portals share, as the learner card the school's office opens as well as the
 * instructor (PRD 6.2, D-330), names both: it is for somebody who can use either. The one whose
 * screen it was pressed on is the one whose setup they must have finished, so a school's owner who
 * also teaches is never sent to finish setting up as an instructor from the school's diary.
 */
export async function requirePortal(portals: Portal | readonly Portal[]): Promise<{ session: Session; access: AccessContext }> {
  const path = await currentPath();
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(path)}`);
  if (secondStepRequired(result.access) && result.session.aal !== 'aal2' && result.session.viewingAs === null) {
    redirectTo(`/mfa?next=${encodeURIComponent(path)}`);
  }
  await requireAgreedTerms(result, path);
  const usable = (typeof portals === 'string' ? [portals] : portals).filter((one) => canUsePortal(result.access, one));
  const portal = usable.find((one) => path.startsWith(portalRoots[one])) ?? usable[0];
  if (portal === undefined) redirectTo(landingPath(result.access));
  if (portal === 'school' && needsSchoolOnboarding(result.access)) redirectTo('/onboarding/school');
  if (portal === 'instructor' && needsOnboarding(result.access)) redirectTo('/onboarding');
  // Back to where they were going once it is done: the payment for a time held only so long (D-337).
  if (portal === 'learner' && needsLearnerOnboarding(result.access)) redirectTo(`/onboarding/about-you?next=${encodeURIComponent(path)}`);
  return result;
}

/** For pages open to any signed-in person (account, MFA, phone verification). */
export async function requireAccess(): Promise<{ session: Session; access: AccessContext }> {
  const result = await requireSecondStepScreen();
  // The account, its password and its devices wait for the second step as the portals do: a
  // password alone changes nothing for somebody who has one (AUTH-08, D-351).
  if (secondStepRequired(result.access) && result.session.aal !== 'aal2') {
    redirectTo(`/mfa?next=${encodeURIComponent(await currentPath())}`);
  }
  return result;
}

/**
 * The gate of the screens that take the second step itself, and the ones before it: signed in, and
 * not viewing as somebody (D-129). Everything else asks for the second step first (D-351).
 */
export async function requireSecondStepScreen(): Promise<{ session: Session; access: AccessContext }> {
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
  // Staff viewing as somebody see their portals, not their account, devices or verification (D-129).
  if (result.session.viewingAs) redirectTo(landingPath(result.access));
  return result;
}

/**
 * For what a portal's own screens read: whoever the request is for, which is the person viewed
 * while staff view as somebody (ADM-06, D-129). Signed-out people go to sign in, and nobody is sent
 * anywhere else: the portal's layout has already decided who may be on the screen. The account
 * guard above sends a viewing back to the portal's home, which from a screen of that same portal
 * bounced staff from More, the plan and the books straight back to Today.
 */
export async function requireSignedIn(): Promise<{ session: Session; access: AccessContext }> {
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
  return result;
}

export async function requireSession(): Promise<Session> {
  return (await requireAccess()).session;
}
