'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { closeEnquirySchema, officeEnquiryConsentWords, officeEnquirySchema } from '@repo/core/schemas/school';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
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
