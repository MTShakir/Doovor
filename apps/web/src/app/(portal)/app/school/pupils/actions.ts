'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { closeEnquirySchema, giveEnquirySchema, offerEnquirySchema, officeEnquiryConsentWords, officeEnquirySchema } from '@repo/core/schemas/school';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createUnclaimedLearnerAccount, removeUnclaimedLearnerAccount } from '@/lib/learners/account';
import { enquiryAllocation, type LearnerAllocation } from '@/lib/school/allocation';
import { enquiryRefused } from '@/lib/school/enquiries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** The school the person asking runs, as its owner or a manager. */
async function runningSchool(): Promise<{ businessId: string; name: string } | null> {
  const { access } = await requirePortal('school');
  const membership = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  return membership ? { businessId: membership.businessId, name: membership.businessName } : null;
}

/** M9-16, D-288: somebody who rang or walked in, typed in by the office once they agreed. */
export async function addEnquiry(input: unknown): Promise<Result<null>> {
  const parsed = officeEnquirySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const school = await runningSchool();
  if (!school) return err('NOT_ALLOWED');

  const { fullName, email, phone, postcode, transmission, note } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('add_school_enquiry', {
    p_school_id: school.businessId,
    p_full_name: fullName,
    p_postcode: postcode,
    p_consent: officeEnquiryConsentWords(school.name),
    p_email: email ?? undefined,
    p_phone: phone ?? undefined,
    p_transmission: transmission === '' ? undefined : transmission,
    p_note: note === '' ? undefined : note,
  });
  if (error) return enquiryRefused(error);
  return ok(null);
}

/** M9-16, D-288: an enquiry that went nowhere, closed with why if the school likes. */
export async function closeEnquiry(input: unknown): Promise<Result<null>> {
  const parsed = closeEnquirySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!(await runningSchool())) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('close_school_enquiry', {
    p_enquiry_id: parsed.data.enquiryId,
    p_reason: parsed.data.reason === '' ? undefined : parsed.data.reason,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'taken') return err('VALIDATION_FAILED', 'An instructor has already taken this pupil.');
    return err(code);
  }
  return ok(null);
}

/** An enquiry closed by mistake, or one that came back. */
export async function reopenEnquiry(enquiryId: unknown): Promise<Result<null>> {
  const parsed = z.uuid().safeParse(enquiryId);
  if (!parsed.success) return err('NOT_FOUND');
  if (!(await runningSchool())) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reopen_school_enquiry', { p_enquiry_id: parsed.data });
  if (error) return err(parsePostgresError(error).code);
  return ok(null);
}

/** What the database says about a pupil no longer waiting, or an instructor no longer linked. */
function pupilRefused(code: Parameters<typeof err>[0], reason: unknown): Result<null> {
  if (reason === 'not_open') return err('VALIDATION_FAILED', 'This pupil is no longer waiting.');
  if (reason === 'not_linked') return err('VALIDATION_FAILED', 'One of them is no longer linked to your school.');
  return err(code);
}

/** M9-17, D-289: a new pupil offered to instructors linked to the school, the first to accept getting them. */
export async function offerEnquiry(input: unknown): Promise<Result<null>> {
  const parsed = offerEnquirySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!(await runningSchool())) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('offer_school_enquiry', {
    p_enquiry_id: parsed.data.enquiryId,
    p_link_ids: parsed.data.linkIds,
    p_hours: parsed.data.hours,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    return pupilRefused(code, context.reason);
  }
  return ok(null);
}

/** M9-18, SCH-03: who of the school's own could teach somebody who asked, best first. */
export async function allocationForEnquiry(enquiryId: unknown): Promise<Result<LearnerAllocation>> {
  const parsed = z.uuid().safeParse(enquiryId);
  if (!parsed.success) return err('NOT_FOUND');
  if (!(await runningSchool())) return err('NOT_ALLOWED');
  try {
    return ok(await enquiryAllocation(parsed.data));
  } catch {
    return err('NOT_FOUND');
  }
}

/**
 * M9-18, D-289: a new pupil given to one of the school's own instructors. The enquiry is read
 * through the caller's own session first, so an account is only ever made for somebody this school
 * was asked by and still has waiting; then the account they will claim (D-068), then the database
 * makes them the school's learner, all in one go, or the account goes again.
 */
export async function giveEnquiry(input: unknown): Promise<Result<null>> {
  const parsed = giveEnquirySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  if (!(await runningSchool())) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { data: enquiry } = await supabase
    .from('school_enquiries')
    .select('full_name, email, phone, status')
    .eq('id', parsed.data.enquiryId)
    .maybeSingle();
  if (!enquiry) return err('NOT_FOUND');
  if (enquiry.status !== 'new' && enquiry.status !== 'offered') return err('VALIDATION_FAILED', 'This pupil is no longer waiting.');

  const account = await createUnclaimedLearnerAccount({ fullName: enquiry.full_name, email: enquiry.email, phone: enquiry.phone });
  if (!account.ok) {
    return account.taken
      ? err('DUPLICATE_CONTACT', 'Those details already belong to an account. Ask them to join with a link from Learners instead.')
      : err('UNKNOWN', 'We could not make their account. Try again.');
  }
  const { error } = await supabase.rpc('give_school_enquiry', {
    p_enquiry_id: parsed.data.enquiryId,
    p_instructor_id: parsed.data.instructorId,
    p_learner_id: account.userId,
  });
  if (error) {
    // The account was a moment old and nobody's, so it goes rather than sits there unowned.
    await removeUnclaimedLearnerAccount(account.userId);
    const { code, context } = parsePostgresError(error);
    return pupilRefused(code, context.reason);
  }
  return ok(null);
}
