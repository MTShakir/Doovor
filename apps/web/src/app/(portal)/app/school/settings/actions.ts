'use server';

import { businessBookingRulesSchema } from '@repo/core/booking-rules';
import { linkedPriceGuideSchema } from '@repo/core/catalogue';
import { onboardingPricesSchema } from '@repo/core/schemas/onboarding';
import { lessonSellerChoiceSchema } from '@repo/core/schemas/school';
import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { requirePortal } from '@/lib/auth/session';
import { savePackage, savePrices } from '@/lib/catalogue/save';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** The school the person asking runs, as its owner or a manager. */
async function runningSchool(): Promise<string | null> {
  const { access } = await requirePortal('school');
  return (
    access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'))?.businessId ?? null
  );
}

/** D-281: who sells the school's lessons, which only its owner says. */
export async function saveLessonSeller(input: unknown): Promise<Result<null>> {
  const parsed = lessonSellerChoiceSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('school');
  const owned = access.memberships.find((one) => one.businessType === 'school' && one.role === 'owner');
  if (!owned) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_lesson_seller', { p_business_id: owned.businessId, p_seller: parsed.data.lessonSeller });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'instructors_teach_here') {
      return err('VALIDATION_FAILED', undefined, {
        lessonSeller: 'Some of your instructors still teach under the school. Choose Some of each while they move to their own.',
      });
    }
    // Instructors linked to the school sell their own lessons, so it cannot sell every one (D-282, D-320).
    if (context.reason === 'linked_instructors') {
      return err('VALIDATION_FAILED', undefined, {
        lessonSeller: 'Some instructors linked to the school sell their own lessons. Choose Some of each while they are linked.',
      });
    }
    return err(code);
  }
  return ok(null);
}

/**
 * SCH-04, D-286: what the school recommends its linked instructors charge an hour, and the most it
 * lets them. Whoever sets the school's prices says it; the database checks.
 */
export async function saveLinkedPriceGuide(input: unknown): Promise<Result<null>> {
  const parsed = linkedPriceGuideSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_linked_price_guide', {
    p_school_id: businessId,
    // Left empty, there is none.
    p_recommended_hourly_pence: parsed.data.recommended ?? undefined,
    p_max_hourly_pence: parsed.data.maximum ?? undefined,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'above_maximum') {
      return err('VALIDATION_FAILED', undefined, { recommended: 'Recommend no more than the most they can charge' });
    }
    return err(code);
  }
  return ok(null);
}

/** SCH-04, R-05: the school's prices, for everybody who teaches there unless allowed their own. */
export async function saveSchoolPrices(input: unknown): Promise<Result<null>> {
  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  return savePrices(businessId, null, input);
}

/**
 * PRD 10.5, SCH-04, D-329: the school's first price, an hour and a block of hours if it sells one,
 * which the database turns into a standard lesson at 1, 1.5 and 2 hours. Until then nothing can be
 * booked with its instructors.
 */
export async function saveSchoolFirstPrices(input: unknown): Promise<Result<null>> {
  const parsed = onboardingPricesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_onboarding_prices', {
    p_business_id: businessId,
    p_hourly_price_pence: parsed.data.hourlyPrice,
    p_package_price_pence: parsed.data.packagePrice ?? undefined,
  });
  if (error) return err(parsePostgresError(error).code);

  // Its instructors' profiles and links show what a lesson costs.
  expireAllInstructorProfiles();
  return ok(null);
}

/** SCH-04, PAY-04: a package of hours the school sells. */
export async function saveSchoolPackage(input: unknown): Promise<Result<{ packageId: string }>> {
  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  return savePackage(businessId, input);
}

/** SCH-04, R-06, PRD 11.1: the notice, horizon, cancellation policy and reminders for the whole school. */
export async function saveSchoolRules(input: unknown): Promise<Result<null>> {
  const parsed = businessBookingRulesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_booking_rules', {
    p_business_id: businessId,
    p_rules: {
      notice_hours: parsed.data.noticeHours,
      horizon_weeks: parsed.data.horizonWeeks,
      cancellation_window_hours: parsed.data.cancellationWindowHours,
      late_fee_percent: parsed.data.lateFeePercent,
      request_expiry_hours: parsed.data.requestExpiryHours,
      reminder_hours_before: parsed.data.reminderHoursBefore,
    },
  });
  if (error) return err(parsePostgresError(error).code);

  // Notice and horizon change the free times on every instructor's profile.
  expireAllInstructorProfiles();
  return ok(null);
}
