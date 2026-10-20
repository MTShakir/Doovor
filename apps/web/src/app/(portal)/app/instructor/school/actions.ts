'use server';

import { parsePostgresError } from '@repo/core/errors';
import { answerOfferSchema } from '@repo/core/schemas/school';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
