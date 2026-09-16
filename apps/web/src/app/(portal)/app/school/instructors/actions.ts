'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { instructorInviteSchema, invitationIdSchema, memberPermissionSchema, memberSwitchSchema } from '@repo/core/schemas/school';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { expireInstructorProfile } from '@/lib/public/instructor-profile';
import { createInstructorInvitation, type InstructorInvitation } from '@/lib/school/invitations';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** The school the person asking runs, as its owner or a manager. */
async function runningSchool(): Promise<{ businessId: string; name: string } | null> {
  const { access } = await requirePortal('school');
  const membership = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  return membership ? { businessId: membership.businessId, name: membership.businessName } : null;
}

/** SCH-02: one link for one instructor, from the school's Instructors screen (D-118). */
export async function inviteToSchool(input: unknown): Promise<Result<InstructorInvitation>> {
  const parsed = instructorInviteSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const school = await runningSchool();
  if (!school) return err('NOT_ALLOWED');
  return createInstructorInvitation(school, parsed.data);
}

/** SCH-02: an invitation sent to the wrong person stops working at once. */
export async function cancelInvitation(invitationId: unknown): Promise<Result<null>> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) return err('NOT_FOUND', 'That invitation could not be found.');

  if (!(await runningSchool())) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('revoke_member_invitation', { p_invitation_id: parsed.data });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'VALIDATION_FAILED') return err('VALIDATION_FAILED', 'They have already joined, so there is nothing to cancel.');
    return err(code);
  }
  return ok(null);
}

/**
 * SCH-02: switch somebody off, or back on. Switched off, they lose the school and their public
 * profile at once (D-120), so the kept copies of the public pages are read fresh.
 */
export async function switchMember(input: unknown): Promise<Result<null>> {
  const parsed = memberSwitchSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  if (!(await runningSchool())) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_member_active', {
    p_membership_id: parsed.data.membershipId,
    p_active: parsed.data.active,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (code === 'VALIDATION_FAILED' && context.reason === 'teaches_elsewhere') {
      return err('VALIDATION_FAILED', 'They teach for another driving business now, so they cannot be switched back on here.');
    }
    return err(code);
  }

  // Their profile, the place pages and the school's page all read it fresh.
  const { data: member } = await supabase
    .from('memberships')
    .select('business_id, user_id')
    .eq('id', parsed.data.membershipId)
    .maybeSingle();
  if (member) {
    const { data: profile } = await supabase
      .from('instructor_profiles')
      .select('id')
      .eq('business_id', member.business_id)
      .eq('user_id', member.user_id)
      .maybeSingle();
    if (profile) expireInstructorProfile(profile.id);
  }
  return ok(null);
}

/** SCH-02, PRD 6.2: whether an instructor sets their own prices, or a manager sees revenue. */
export async function changePermission(input: unknown): Promise<Result<null>> {
  const parsed = memberPermissionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  if (!(await runningSchool())) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_member_permission', {
    p_membership_id: parsed.data.membershipId,
    p_permission: parsed.data.permission,
    p_allowed: parsed.data.allowed,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'NOT_ALLOWED') return err('NOT_ALLOWED', 'Only the owner decides that.');
    return err(code);
  }
  return ok(null);
}
