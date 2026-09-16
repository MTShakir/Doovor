import 'server-only';
import { getAccessContext } from '@repo/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { takePendingBooking } from '@/lib/booking/pending';
import { forgetInvitation, readInvitation } from './invitation-cookie';
import { availablePortals, landingPath, safeNextPath } from './portals';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface OpenedInvitation {
  token: string;
  kind: 'learner' | 'member';
  usable: boolean;
}

/** What the remembered invitation is for, and whether it still works. Null for a link nobody made. */
async function openInvitation(supabase: ServerClient, token: string): Promise<OpenedInvitation | null> {
  const { data } = await supabase.rpc('invitation_details', { p_token: token }).maybeSingle();
  if (!data) return null;
  return { token, kind: data.kind === 'member' ? 'member' : 'learner', usable: !data.expired };
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

  if (availablePortals(access).length === 0) {
    const { data: profile } = await supabase.from('users').select('intended_role, full_name').eq('id', user.id).single();
    const metadata = user.user_metadata as Record<string, unknown>;
    const schoolName = typeof metadata.school_name === 'string' ? metadata.school_name.trim() : '';

    if (profile?.intended_role === 'learner') {
      await supabase.from('learner_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    } else if (profile?.intended_role === 'instructor' && invitation?.kind !== 'member') {
      await supabase.rpc('create_business', { p_type: 'independent', p_name: profile.full_name || 'My driving business' });
    } else if (profile?.intended_role === 'school' && schoolName) {
      await supabase.rpc('create_business', { p_type: 'school', p_name: schoolName });
    }
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

  const destination = availablePortals(access).length > 0 ? safeNextPath(next, landingPath(access)) : '/start';

  // Instructors verify their mobile by text after sign-up (AUTH-02, PRD 10.1 step 2).
  const isInstructor = access.memberships.some((m) => m.instructorProfileId !== null);
  if (isInstructor && !user.phone_confirmed_at) {
    return `/verify-phone?next=${encodeURIComponent(destination)}`;
  }
  return destination;
}
