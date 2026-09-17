'use server';

import { businessBookingRulesSchema } from '@repo/core/booking-rules';
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

/** SCH-04, R-05: the school's prices, for everybody who teaches there unless allowed their own. */
export async function saveSchoolPrices(input: unknown): Promise<Result<null>> {
  const businessId = await runningSchool();
  if (!businessId) return err('NOT_ALLOWED');
  return savePrices(businessId, null, input);
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
