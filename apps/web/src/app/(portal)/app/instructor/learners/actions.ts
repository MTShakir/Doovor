'use server';

import { defaultErrorCopy, parsePostgresError, type DomainErrorCode } from '@repo/core/errors';
import { invitationLink } from '@repo/core/invitations';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
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

interface NewLearner {
  fullName: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  transmission: 'manual' | 'automatic' | null;
}

type Linked = { ok: true; learnerId: string } | { ok: false; code: DomainErrorCode; reason: string };

/**
 * One learner who has never heard of us: the account they will claim later (D-068), then
 * the link to the Business through the caller's own session. Shared by typing somebody in
 * and by importing a hundred of them, because the rules are the same either way.
 */
async function linkNewLearner(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  where: { instructorProfileId: string; businessId: string },
  learner: NewLearner,
  source: 'manual' | 'import',
): Promise<Linked> {
  const existing = await alreadyHere(supabase, where.businessId, learner);
  if (existing !== null) {
    return { ok: false, code: 'DUPLICATE_CONTACT', reason: `${existing} is already on your list with those details.` };
  }

  const account = await createUnclaimedLearnerAccount({
    fullName: learner.fullName,
    email: learner.email,
    phone: learner.phone,
  });
  if (!account.ok) {
    return account.taken
      ? {
          ok: false,
          code: 'DUPLICATE_CONTACT',
          reason: 'Those details already belong to an account. Send them a link instead, so they can join you themselves.',
        }
      : { ok: false, code: 'UNKNOWN', reason: 'We could not make their account. Try again.' };
  }

  const { error } = await supabase.rpc('add_learner', {
    p_instructor_id: where.instructorProfileId,
    p_learner_id: account.userId,
    p_postcode: learner.postcode ?? undefined,
    p_transmission: learner.transmission ?? undefined,
    p_source: source,
  });
  if (error) {
    // The account was ours and a moment old, so it goes rather than sits there unowned.
    await removeUnclaimedLearnerAccount(account.userId);
    const { code } = parsePostgresError(error);
    return { ok: false, code, reason: defaultErrorCopy[code] };
  }

  return { ok: true, learnerId: account.userId };
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
  const result = await linkNewLearner(supabase, place, parsed.data, 'manual');
  if (!result.ok) return err(result.code, result.reason);

  revalidatePath('/app/instructor/learners');
  return ok({ learnerId: result.learnerId });
}

const importRowSchema = z.object({
  /** The line in the file, so a problem can be pointed at. */
  line: z.number().int().min(1),
  fullName: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  postcode: z.string().default(''),
});

const importSchema = z.object({
  // One batch at a time, so a long file reports as it goes rather than timing out in silence.
  rows: z.array(importRowSchema).min(1).max(25),
});

export interface ImportOutcome {
  imported: number;
  problems: { line: number; name: string; reason: string }[];
}

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
  const problems: ImportOutcome['problems'] = [];
  let imported = 0;

  for (const { line, ...row } of parsed.data.rows) {
    // A spreadsheet has no column for the gearbox, so that is asked for later, on the card.
    const details = manualLearnerSchema.safeParse({ ...row, transmission: '' });
    if (!details.success) {
      problems.push({
        line,
        name: row.fullName,
        reason: details.error.issues[0]?.message ?? 'We could not read that row',
      });
      continue;
    }

    const result = await linkNewLearner(supabase, place, details.data, 'import');
    if (result.ok) imported += 1;
    else problems.push({ line, name: details.data.fullName, reason: result.reason });
  }

  if (imported > 0) revalidatePath('/app/instructor/learners');
  return ok({ imported, problems });
}
