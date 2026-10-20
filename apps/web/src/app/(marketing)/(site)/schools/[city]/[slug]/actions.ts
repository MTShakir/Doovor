'use server';

import { err, ok, type Result } from '@repo/core/result';
import { enquiryConsentWords, schoolEnquirySchema } from '@repo/core/schemas/school';
import { z } from '@repo/core/zod';
import { fieldErrors } from '@/lib/forms';
import { schoolProfile } from '@/lib/public/school-profile';
import { enquiryRefused } from '@/lib/school/enquiries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const slugSchema = z.string().min(1).max(200);

/** A box a person never sees: filled in, the form came from a script. */
function fromAScript(input: unknown): boolean {
  if (typeof input !== 'object' || input === null || !('company' in input)) return false;
  const { company } = input;
  return typeof company === 'string' && company.trim() !== '';
}

/**
 * M9-15, D-288: somebody asks a school for lessons from its page. The database checks again,
 * counts how often a caller asks, and keeps the words they agreed to.
 */
export async function askSchool(slug: unknown, input: unknown): Promise<Result<null>> {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) return err('NOT_FOUND');
  // Answered as if it worked, so a script learns nothing from it.
  if (fromAScript(input)) return ok(null);
  const parsed = schoolEnquirySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const school = await schoolProfile(parsedSlug.data);
  if (!school) return err('NOT_FOUND', 'This school is not taking enquiries here.');
  const { fullName, email, phone, postcode, transmission, note } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('submit_school_enquiry', {
    p_slug: parsedSlug.data,
    p_full_name: fullName,
    p_postcode: postcode,
    p_consent: enquiryConsentWords(school.name),
    p_email: email ?? undefined,
    p_phone: phone ?? undefined,
    p_transmission: transmission === '' ? undefined : transmission,
    p_note: note === '' ? undefined : note,
  });
  if (error) return enquiryRefused(error);
  return ok(null);
}
