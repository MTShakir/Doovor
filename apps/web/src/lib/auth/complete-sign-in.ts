import 'server-only';
import { getAccessContext } from '@repo/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { takePendingBooking } from '@/lib/booking/pending';
import { forgetInvitation, readInvitation } from './invitation-cookie';
import { forgetReferral, readReferral } from './referral-cookie';
import { availablePortals, landingPath, safeNextPath } from './portals';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface OpenedInvitation {
  token: string;
  kind: 'learner' | 'member' | 'link';
  usable: boolean;
}

/** What the remembered invitation is for, and whether it still works. Null for a link nobody made. */
async function openInvitation(supabase: ServerClient, token: string): Promise<OpenedInvitation | null> {
  const { data } = await supabase.rpc('invitation_details', { p_token: token }).maybeSingle();
  if (!data) return null;
  const kind = data.kind === 'member' || data.kind === 'link' ? data.kind : 'learner';
  return { token, kind, usable: !data.expired };
}

/**
 * Every sign-in path ends here (password, magic link, Google, phone code). On the first
 * sign-in it finishes setting up the role chosen at sign-up (AUTH-03): the instructor's
 * Business of one, the school, or the learner profile. Returns where to go next.
 */
export async function completeSignIn(next?: string | null): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return '/sign-in';

  let access = await getAccessContext(supabase, user.id);

  // An invitation opened before the account existed (AUTH-07, D-064). One to teach for a school
  // is accepted first, so an instructor who came to join a school is not also made a Business of
  // their own (AUTH-05, D-118). A link that has since stopped working simply does nothing.
  const token = await readInvitation();
  const invitation = token === null ? null : await openInvitation(supabase, token);
  if (invitation?.kind === 'member' && invitation.usable) {
    await supabase.rpc('accept_member_invitation', { p_token: invitation.token });
    access = await getAccessContext(supabase, user.id);
  }

  // A business set up now, for an instructor who came from a school's link to link one (D-282).
  let businessSetUp = false;
  // Somebody whose own Business is paused opens it again rather than being given another (D-292).
  if (availablePortals(access).length === 0 && access.pausedBusinesses.length === 0) {
    const { data: profile } = await supabase.from('users').select('intended_role, full_name').eq('id', user.id).single();
    const metadata = user.user_metadata as Record<string, unknown>;
    const schoolName = typeof metadata.school_name === 'string' ? metadata.school_name.trim() : '';

    // The code on the link they arrived from, if any (D-205). The database decides whether it is
    // worth anything; a code nobody has simply earns nobody anything.
    const referral = await readReferral();

    if (profile?.intended_role === 'learner') {
      await supabase.from('learner_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    } else if (profile?.intended_role === 'instructor' && invitation?.kind !== 'member') {
      await supabase.rpc('create_business', {
        p_type: 'independent',
        p_name: profile.full_name || 'My driving business',
        p_referral_code: referral ?? undefined,
      });
      businessSetUp = true;
    } else if (profile?.intended_role === 'school' && schoolName) {
      await supabase.rpc('create_business', { p_type: 'school', p_name: schoolName, p_referral_code: referral ?? undefined });
    }
    if (referral !== null) await forgetReferral();
    access = await getAccessContext(supabase, user.id);
  }

  // The account was made from a school's link to link a business, so the business it now has is
  // linked straight away. Somebody signing in with a business already says yes on the link's page.
  if (invitation?.kind === 'link' && invitation.usable && businessSetUp) {
    await supabase.rpc('accept_link_invitation', { p_token: invitation.token });
    access = await getAccessContext(supabase, user.id);
  }

  if (invitation?.kind === 'learner' && invitation.usable && access.isLearner) {
    await supabase.rpc('accept_invitation', { p_token: invitation.token });
    access = await getAccessContext(supabase, user.id);
  }

  // Kept only while the person has still to say what they are here as (after Google, for
  // example), so it is accepted once they have. Otherwise it has done all it can.
  if (token !== null && availablePortals(access).length > 0) await forgetInvitation();

  // A slot chosen on a booking link before there was an account is waiting; they go back to
  // the link with it picked, and press the button themselves (BOK-02, D-069).
  const pending = await takePendingBooking();
  if (pending && access.isLearner) {
    return `/book/${encodeURIComponent(pending.slug)}?slot=${encodeURIComponent(pending.startsAt)}`;
  }

  // With no portal, the landing says why: a role to choose, a suspended or a paused Business (D-292).
  const destination = availablePortals(access).length > 0 ? safeNextPath(next, landingPath(access)) : landingPath(access);

  // Instructors verify their mobile by text after sign-up (AUTH-02, PRD 10.1 step 2).
  const isInstructor = access.memberships.some((m) => m.instructorProfileId !== null);
  if (isInstructor && !user.phone_confirmed_at) {
    return `/verify-phone?next=${encodeURIComponent(destination)}`;
  }
  return destination;
}
