'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { businessBookingRulesSchema, instructorBookingRulesSchema } from '@repo/core/booking-rules';
import { availabilityExceptionSchema, workingWeekSchema } from '@repo/core/schemas/availability';
import { localToUtc } from '@repo/core/time';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function instructorId(): Promise<string | null> {
  const { access } = await requirePortal('instructor');
  return access.memberships.find((m) => m.instructorProfileId !== null)?.instructorProfileId ?? null;
}

/**
 * DIA-01: the week they work. Rows are replaced day by day rather than through the onboarding
 * function, because this screen can give each day its own hours.
 */
export async function saveWorkingWeek(input: unknown): Promise<Result<null>> {
  const parsed = workingWeekSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const profileId = await instructorId();
  if (!profileId) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('business_id')
    .eq('id', profileId)
    .single();
  if (!profile) return err('NOT_FOUND');

  const working = parsed.data.days.filter((day) => day.working);
  // Cleared first, so a day that is no longer worked does not linger.
  const { error: cleared } = await supabase.from('working_hours').delete().eq('instructor_id', profileId);
  if (cleared) return err('UNKNOWN', 'We could not save your hours. Try again.');

  if (working.length > 0) {
    const { error } = await supabase.from('working_hours').insert(
      working.map((day) => ({
        instructor_id: profileId,
        business_id: profile.business_id,
        weekday: day.weekday,
        start_time: day.startTime,
        end_time: day.endTime,
      })),
    );
    if (error) return err('UNKNOWN', 'We could not save your hours. Try again.');
  }

  revalidatePath('/app/instructor/settings');
  return ok(null);
}

/** DIA-02: an open slot, or time off. Overlaps are resolved by the database (M1-17). */
export async function saveException(input: unknown): Promise<Result<null>> {
  const parsed = availabilityExceptionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const profileId = await instructorId();
  if (!profileId) return err('NOT_ALLOWED');

  const { date, startTime, endTime, kind, reason } = parsed.data;
  const starts = localToUtc(date, startTime);
  const ends = localToUtc(date, endTime);
  // The hour that does not exist when the clocks go forward (R-14).
  if (!starts || !ends) {
    return err('VALIDATION_FAILED', undefined, { startTime: 'That time does not exist on that day' });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_availability_exception', {
    p_instructor_id: profileId,
    p_kind: kind,
    p_starts_at: starts.toISOString(),
    p_ends_at: ends.toISOString(),
    p_reason: reason === '' ? undefined : reason,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/settings');
  return ok(null);
}

/** PRD 11.1: the settings a Business owns. Ranges are checked here and in the database. */
export async function saveBookingRules(input: unknown): Promise<Result<null>> {
  const parsed = businessBookingRulesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_booking_rules', {
    p_business_id: membership.businessId,
    p_rules: {
      notice_hours: parsed.data.noticeHours,
      horizon_weeks: parsed.data.horizonWeeks,
      cancellation_window_hours: parsed.data.cancellationWindowHours,
      late_fee_percent: parsed.data.lateFeePercent,
      request_expiry_hours: parsed.data.requestExpiryHours,
    },
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/settings');
  return ok(null);
}

/** PRD 11.1, BOK-06: the two an instructor owns for their own diary. */
export async function saveInstructorRules(input: unknown): Promise<Result<null>> {
  const parsed = instructorBookingRulesSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const profileId = await instructorId();
  if (!profileId) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('instructor_profiles')
    .update({ buffer_minutes: parsed.data.bufferMinutes, instant_book: parsed.data.instantBook })
    .eq('id', profileId);
  if (error) return err('UNKNOWN', 'We could not save those settings. Try again.');

  revalidatePath('/app/instructor/settings');
  return ok(null);
}

export async function removeException(id: unknown): Promise<Result<null>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const profileId = await instructorId();
  if (!profileId) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('availability_exceptions')
    .delete()
    .eq('id', parsed.data)
    .eq('instructor_id', profileId);
  if (error) return err('UNKNOWN', 'We could not remove that. Try again.');

  revalidatePath('/app/instructor/settings');
  return ok(null);
}
