'use server';

import { parsePostgresError } from '@repo/core/errors';
import { invitationLink } from '@repo/core/invitations';
import { err, ok, type Result } from '@repo/core/result';
import { z } from 'zod';
import { getAppUrl } from '@/lib/app-url';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { emailSchema, ukMobileSchema } from '@repo/core/schemas/auth';

const inviteSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email', 'link']),
  fullName: z.string().trim().max(120, { error: 'Use 120 characters or fewer' }),
  email: z.union([z.literal('').transform(() => null), emailSchema]),
  phone: z.union([z.literal('').transform(() => null), ukMobileSchema]),
});

export interface Invitation {
  link: string;
  instructorName: string;
  learnerName: string | null;
  email: string | null;
  phone: string | null;
}

/** AUTH-07: one link, shared however the instructor already talks to that learner. */
export async function inviteLearner(input: unknown): Promise<Result<Invitation>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return err('NOT_ALLOWED');

  const { channel, fullName, email, phone } = parsed.data;
  if (channel === 'email' && email === null) {
    return err('VALIDATION_FAILED', undefined, { email: 'Enter an email address to send it to' });
  }
  if ((channel === 'sms' || channel === 'whatsapp') && phone === null) {
    return err('VALIDATION_FAILED', undefined, { phone: 'Enter a mobile number to send it to' });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc('invite_learner', {
      p_instructor_id: membership.instructorProfileId,
      p_channel: channel,
      p_full_name: fullName === '' ? undefined : fullName,
      p_email: email ?? undefined,
      p_phone: phone ?? undefined,
    })
    .single();
  if (error) {
    const { code } = parsePostgresError(error);
    return err(code === 'UNKNOWN' ? 'RATE_LIMITED' : code);
  }

  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('display_name')
    .eq('id', membership.instructorProfileId)
    .maybeSingle();

  // The token exists here and nowhere else: it is not stored, only its hash is.
  return ok({
    link: invitationLink(getAppUrl(), data.token),
    instructorName: profile?.display_name ?? 'your instructor',
    learnerName: fullName === '' ? null : fullName,
    email,
    phone,
  });
}
