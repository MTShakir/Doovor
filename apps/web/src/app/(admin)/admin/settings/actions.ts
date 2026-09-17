'use server';

import { parsePostgresError } from '@repo/core/errors';
import {
  bookingDefaultsSchema,
  bookingDefaultsSetting,
  featureFlagsSchema,
  featureFlagsSetting,
  marketplaceFeeSchema,
  marketplaceFeeSetting,
  planLimitsSchema,
  planLimitsSetting,
  switchOnRuleSchema,
  switchOnRuleSetting,
} from '@repo/core/platform-settings';
import { err, ok, type Result } from '@repo/core/result';
import type { Json } from '@repo/db/types';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { expireFeatureFlags } from '@/lib/flags';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type SettingKey = 'booking_defaults' | 'marketplace_switch_on' | 'plan_limits' | 'marketplace_fee' | 'feature_flags';

/** The database names a value by where the settings keep it; the form by its own field. */
const formFields: Record<string, string> = {
  buffer_minutes: 'bufferMinutes',
  notice_hours: 'noticeHours',
  horizon_weeks: 'horizonWeeks',
  cancellation_window_hours: 'cancellationWindowHours',
  late_fee_percent: 'lateFeePercent',
  request_expiry_hours: 'requestExpiryHours',
  reminder_hours_before: 'reminderHoursBefore',
  verified_instructors: 'instructors',
  open_hours_14_days: 'hours',
  pro: 'proSms',
  school: 'schoolSms',
  percent: 'percent',
  cap_pence: 'cap',
};

/**
 * ADM-05: one setting saved. The database decides who may (a super admin past their second step),
 * checks every value again and audits the change (D-128); what depends on it is read fresh.
 */
async function save<Schema extends z.ZodType>(
  key: SettingKey,
  schema: Schema,
  input: unknown,
  toSetting: (value: z.infer<Schema>) => Json,
  after: () => void,
): Promise<Result<null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_platform_setting', {
    p_key: key,
    p_value: toSetting(parsed.data),
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    const field = typeof context.field === 'string' ? formFields[context.field] : undefined;
    return field ? err(code, undefined, { [field]: 'Choose a value in range' }) : err(code);
  }
  revalidatePath('/admin/settings');
  after();
  return ok(null);
}

export async function saveBookingDefaults(input: unknown): Promise<Result<null>> {
  // Free times on every profile and booking link follow the notice, horizon and gap (PUB-01).
  return save('booking_defaults', bookingDefaultsSchema, input, bookingDefaultsSetting, expireAllInstructorProfiles);
}

export async function saveSwitchOnRule(input: unknown): Promise<Result<null>> {
  return save('marketplace_switch_on', switchOnRuleSchema, input, switchOnRuleSetting, () => { revalidatePath('/admin/regions'); });
}

export async function savePlanLimits(input: unknown): Promise<Result<null>> {
  return save('plan_limits', planLimitsSchema, input, planLimitsSetting, () => undefined);
}

export async function saveMarketplaceFee(input: unknown): Promise<Result<null>> {
  return save('marketplace_fee', marketplaceFeeSchema, input, marketplaceFeeSetting, () => undefined);
}

export async function saveFeatureFlags(input: unknown): Promise<Result<null>> {
  return save('feature_flags', featureFlagsSchema, input, featureFlagsSetting, expireFeatureFlags);
}
