import 'server-only';
import { lessonPricesSchema, packageSchema } from '@repo/core/catalogue';
import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles, expireInstructorProfile } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Saves prices for a Business, or one instructor's own (R-05, SCH-04): all of them or none. The
 * database checks who may, and the public pages read the prices fresh afterwards. Server Actions
 * only, after they have found the Business the person runs or teaches for.
 */
export async function savePrices(businessId: string, instructorId: string | null, input: unknown): Promise<Result<null>> {
  const parsed = lessonPricesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_lesson_prices', {
    p_business_id: businessId,
    // Without an instructor, these are the Business's own prices.
    ...(instructorId === null ? {} : { p_instructor_id: instructorId }),
    p_prices: parsed.data.prices.map((one) => ({
      lesson_type_id: one.lessonTypeId,
      duration_minutes: one.durationMinutes,
      price_pence: one.price,
    })),
  });
  if (error) {
    const { code } = parsePostgresError(error);
    return err(code === 'VALIDATION_FAILED' ? 'VALIDATION_FAILED' : code, code === 'VALIDATION_FAILED' ? 'Those prices could not be saved. Check them and try again.' : undefined);
  }

  if (instructorId === null) expireAllInstructorProfiles();
  else expireInstructorProfile(instructorId);
  return ok(null);
}

/** Adds a package, or changes one, for a Business (PAY-04, SCH-04). Row-level security decides who may. */
export async function savePackage(businessId: string, input: unknown): Promise<Result<{ packageId: string }>> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { packageId, name, hours, price, expiryDays, onSale } = parsed.data;
  const row = { name, minutes: hours, price_pence: price, expiry_days: expiryDays, is_active: onSale };
  const supabase = await createSupabaseServerClient();
  const saved =
    packageId === null
      ? await supabase.from('packages').insert({ ...row, business_id: businessId }).select('id').single()
      : await supabase.from('packages').update(row).eq('id', packageId).eq('business_id', businessId).select('id').single();
  if (saved.error) {
    const { code } = parsePostgresError(saved.error);
    // No row back from an update is somebody else's package, or no package at all.
    return err(code === 'NOT_FOUND' ? 'NOT_ALLOWED' : code, 'That package could not be saved. Try again.');
  }

  // Profiles and school pages show packages too.
  expireAllInstructorProfiles();
  return ok({ packageId: saved.data.id });
}
