'use server';

import { parsePostgresError } from '@repo/core/errors';
import { invitationLink } from '@repo/core/invitations';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { manualLearnerSchema } from '@repo/core/schemas/learner';
import { getAppUrl } from '@/lib/app-url';
import { createUnclaimedLearnerAccount, removeUnclaimedLearnerAccount } from '@/lib/learners/account';
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

/** Somebody already on this instructor's list with the same number or address (LRN-03). */
async function alreadyHere(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  businessId: string,
  contact: { email: string | null; phone: string | null },
): Promise<string | null> {
  const here = async (column: 'email' | 'phone', value: string): Promise<string | null> => {
    const { data } = await supabase
      .from('learner_list')
      .select('full_name')
      .eq('business_id', businessId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    return data?.full_name ?? null;
  };

  // Supabase Auth keeps a number without its plus, which is how it reaches the list.
  const byPhone = contact.phone === null ? null : await here('phone', contact.phone.replace('+', ''));
  if (byPhone !== null) return byPhone;
  return contact.email === null ? null : await here('email', contact.email);
}

/**
 * LRN-03: a learner the instructor already teaches, who has never heard of us. We make the
 * account they will claim later (D-068), then link them through their own session.
 */
export async function addLearner(input: unknown): Promise<Result<{ learnerId: string }>> {
  const parsed = manualLearnerSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return err('NOT_ALLOWED');

  const { fullName, email, phone, postcode, transmission } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const existing = await alreadyHere(supabase, membership.businessId, { email, phone });
  if (existing !== null) {
    return err('DUPLICATE_CONTACT', `${existing} is already on your list with those details.`);
  }

  const account = await createUnclaimedLearnerAccount({ fullName, email, phone });
  if (!account.ok) {
    return account.taken
      ? err(
          'DUPLICATE_CONTACT',
          'Those details already belong to an account. Send them a link instead, so they can join you themselves.',
        )
      : err('UNKNOWN');
  }

  const { error } = await supabase.rpc('add_learner', {
    p_instructor_id: membership.instructorProfileId,
    p_learner_id: account.userId,
    p_postcode: postcode ?? undefined,
    p_transmission: transmission ?? undefined,
    p_source: 'manual',
  });
  if (error) {
    // The account was ours and a moment old, so it goes rather than sits there unowned.
    await removeUnclaimedLearnerAccount(account.userId);
    return err(parsePostgresError(error).code);
  }

  revalidatePath('/app/instructor/learners');
  return ok({ learnerId: account.userId });
}
