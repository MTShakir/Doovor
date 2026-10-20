'use server';

import { parsePostgresError } from '@repo/core/errors';
import { invitationLink } from '@repo/core/invitations';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { manualLearnerSchema } from '@repo/core/schemas/learner';
import { getAppUrl } from '@/lib/app-url';
import { importRows, importSchema, linkNewLearner, type ImportOutcome, type Linked, type NewLearner } from '@/lib/learners/add';
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

/** The instructor's own list, through `add_learner`. */
function linkToInstructor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  where: { instructorProfileId: string; businessId: string },
  learner: NewLearner,
  source: 'manual' | 'import',
): Promise<Linked> {
  return linkNewLearner(supabase, where.businessId, learner, (learnerId) =>
    supabase.rpc('add_learner', {
      p_instructor_id: where.instructorProfileId,
      p_learner_id: learnerId,
      p_postcode: learner.postcode ?? undefined,
      p_transmission: learner.transmission ?? undefined,
      p_source: source,
    }),
  );
}

/** Where the caller teaches, for the two actions below. */
async function instructorPlace(): Promise<{ instructorProfileId: string; businessId: string } | null> {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;
  return { instructorProfileId: membership.instructorProfileId, businessId: membership.businessId };
}

/** LRN-03: a learner the instructor already teaches, typed in by them. */
export async function addLearner(input: unknown): Promise<Result<{ learnerId: string }>> {
  const parsed = manualLearnerSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const place = await instructorPlace();
  if (!place) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const result = await linkToInstructor(supabase, place, parsed.data, 'manual');
  if (!result.ok) return err(result.code, result.reason);

  revalidatePath('/app/instructor/learners');
  return ok({ learnerId: result.learnerId });
}

export type { ImportOutcome };

/**
 * LRN-03: a batch of rows from a spreadsheet. A row that cannot be imported is reported
 * with its line number and the reason, and the rest of the batch still goes in.
 */
export async function importLearners(input: unknown): Promise<Result<ImportOutcome>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const place = await instructorPlace();
  if (!place) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const outcome = await importRows(parsed.data.rows, (learner) => linkToInstructor(supabase, place, learner, 'import'));
  if (outcome.imported > 0) revalidatePath('/app/instructor/learners');
  return ok(outcome);
}
