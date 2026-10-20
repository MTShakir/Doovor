'use server';

import { parsePostgresError } from '@repo/core/errors';
import { answerOfferSchema } from '@repo/core/schemas/school';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createUnclaimedLearnerAccount, removeUnclaimedLearnerAccount } from '@/lib/learners/account';
import { ownSchoolLink } from '@/lib/school/link';
import { pupilOffersFor } from '@/lib/school/pupil-offers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const linkIdSchema = z.uuid();

/**
 * D-282: the instructor leaves the school their business is linked to. The database checks it is
 * theirs to leave; the public pages are read fresh, as the profile no longer names the school.
 */
export async function leaveSchool(linkId: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = linkIdSchema.safeParse(linkId);
  if (!parsed.success) return err('NOT_FOUND', 'That school could not be found.');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('end_school_link', { p_link_id: parsed.data });
  if (error) return err(parsePostgresError(error).code);
  expireAllInstructorProfiles();
  return ok(null);
}

const offerRefusals: Record<string, string> = {
  taken: 'Another instructor said yes first.',
  lapsed: 'This offer ran out.',
  withdrawn: 'The school took this offer back.',
  not_linked: 'You are no longer linked to this school.',
  answered: 'You have already answered this one.',
};

/** M9-17, D-289: the linked instructor accepts a pupil the school offered, or declines them. */
export async function answerOffer(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = answerOfferSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND', 'That offer could not be found.');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('answer_enquiry_offer', { p_offer_id: parsed.data.offerId, p_accept: parsed.data.accept });
  if (error) {
    const { code, context } = parsePostgresError(error);
    const said = typeof context.reason === 'string' ? offerRefusals[context.reason] : undefined;
    return said === undefined ? err(code) : err('VALIDATION_FAILED', said);
  }
  return ok(null);
}

/**
 * M9-19, D-290: a pupil the instructor accepted, put on their own list as one the school
 * introduced. The pupil is read through the instructor's own session first, so an account is only
 * made for somebody their Business took; then the account they will claim (D-068); then the
 * database links them, or the account goes again.
 */
export async function addEnquiryLearner(enquiryId: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = linkIdSchema.safeParse(enquiryId);
  if (!parsed.success) return err('NOT_FOUND', 'That pupil could not be found.');

  await requirePortal('instructor');
  const linked = await ownSchoolLink();
  if (!linked) return err('NOT_FOUND', 'That pupil could not be found.');
  const pupil = (await pupilOffersFor(linked.businessId)).find((one) => one.enquiryId === parsed.data && one.contact !== null);
  if (!pupil?.contact) return err('NOT_FOUND', 'That pupil could not be found.');
  if (pupil.learnerAdded) return err('VALIDATION_FAILED', 'They are on your list already.');

  const account = await createUnclaimedLearnerAccount({
    fullName: pupil.contact.fullName,
    email: pupil.contact.email,
    phone: pupil.contact.phoneE164,
  });
  if (!account.ok) {
    return account.taken
      ? err('DUPLICATE_CONTACT', 'Those details already belong to an account. Send them a link from Learners instead.')
      : err('UNKNOWN', 'We could not make their account. Try again.');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('add_enquiry_learner', { p_enquiry_id: parsed.data, p_learner_id: account.userId });
  if (error) {
    // The account was a moment old and nobody's, so it goes rather than sits there unowned.
    await removeUnclaimedLearnerAccount(account.userId);
    const { code, context } = parsePostgresError(error);
    return context.reason === 'already_added' ? err('VALIDATION_FAILED', 'They are on your list already.') : err(code);
  }
  revalidatePath('/app/instructor/learners');
  return ok(null);
}
