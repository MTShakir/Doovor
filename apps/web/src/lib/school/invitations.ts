import 'server-only';
import { parsePostgresError } from '@repo/core/errors';
import { invitationLink } from '@repo/core/invitations';
import { err, ok, type Result } from '@repo/core/result';
import type { InstructorInvite, InstructorInviteKind } from '@repo/core/schemas/school';
import { getAppUrl } from '@/lib/app-url';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface InstructorInvitation {
  /** To teach under the school, or to link a business of their own to it (D-282). */
  kind: InstructorInviteKind;
  link: string;
  schoolName: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * One link for one instructor to join a school (AUTH-05, SCH-02), sent from the owner's or a
 * manager's own phone (D-118). The token exists here and nowhere else: only its hash is stored.
 * Used while the school is being set up and from its Instructors screen.
 */
export async function createInstructorInvitation(
  school: { businessId: string; name: string },
  invite: InstructorInvite,
): Promise<Result<InstructorInvitation>> {
  const { kind, channel, fullName, email, phone } = invite;
  const supabase = await createSupabaseServerClient();
  const who = { p_channel: channel, p_full_name: fullName === '' ? undefined : fullName, p_email: email ?? undefined, p_phone: phone ?? undefined };
  const { data, error } =
    kind === 'link'
      ? await supabase.rpc('invite_linked_instructor', { p_school_id: school.businessId, ...who }).single()
      : await supabase.rpc('invite_member', { p_business_id: school.businessId, p_role: 'instructor', ...who }).single();
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'school_sells') {
      return err('VALIDATION_FAILED', 'Say in Settings that your instructors sell their own lessons, then link them.');
    }
    return err(code);
  }

  return ok({
    kind,
    link: invitationLink(getAppUrl(), data.token),
    schoolName: school.name,
    fullName: fullName === '' ? null : fullName,
    email,
    phone,
  });
}
