import 'server-only';
import { flagsFromSettings, isFlagEnabled } from '@repo/config/flags';
import { getEntitlements } from '@repo/config/plans';
import { resolveBookingRules, type BookingRules } from '@repo/core/booking-rules';
import { formatDateWithYear } from '@repo/core/time';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const settingSchema = z.object({ value: z.record(z.string(), z.unknown()), updated_at: z.string() });

// The function answers JSON, so it is read the way any input is.
const settingsSchema = z.object({
  booking_defaults: settingSchema,
  marketplace_switch_on: settingSchema,
  plan_limits: settingSchema,
  marketplace_fee: settingSchema,
  feature_flags: settingSchema,
});

export interface AdminSettings {
  bookingDefaults: BookingRules;
  switchOnRule: { instructors: number; hours: number };
  planLimits: { proSms: number; schoolSms: number };
  marketplaceFee: { percent: number; capPence: number };
  flags: { googleSignIn: boolean; appleSignIn: boolean; marketplace: boolean };
  /** "Thu 17 Sep 2026": when each was last changed. */
  changedOn: Record<'bookingDefaults' | 'switchOnRule' | 'planLimits' | 'marketplaceFee' | 'flags', string>;
}

function whole(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback;
}

function smsOf(value: unknown, fallback: number): number {
  return typeof value === 'object' && value !== null ? whole((value as Record<string, unknown>).sms_reminders_per_month, fallback) : fallback;
}

/** The platform settings a super admin looks after, as the Settings screen shows them (ADM-05, M5-20). */
export async function adminSettings(): Promise<AdminSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_platform_settings');
  if (error) throw new Error(`Could not read the platform settings: ${error.message}`);
  const settings = settingsSchema.parse(data);
  const flags = flagsFromSettings(settings.feature_flags.value);
  const on = (setting: z.infer<typeof settingSchema>) => formatDateWithYear(new Date(setting.updated_at));

  return {
    bookingDefaults: resolveBookingRules(settings.booking_defaults.value, null, null),
    switchOnRule: {
      instructors: whole(settings.marketplace_switch_on.value.verified_instructors, 25),
      hours: whole(settings.marketplace_switch_on.value.open_hours_14_days, 150),
    },
    planLimits: {
      proSms: smsOf(settings.plan_limits.value.pro, getEntitlements('pro').smsRemindersPerMonth),
      schoolSms: smsOf(settings.plan_limits.value.school, getEntitlements('school').smsRemindersPerMonth),
    },
    marketplaceFee: {
      percent: whole(settings.marketplace_fee.value.percent, 5),
      capPence: whole(settings.marketplace_fee.value.cap_pence, 200),
    },
    flags: {
      googleSignIn: isFlagEnabled('googleSignIn', flags),
      appleSignIn: isFlagEnabled('appleSignIn', flags),
      marketplace: isFlagEnabled('marketplace', flags),
    },
    changedOn: {
      bookingDefaults: on(settings.booking_defaults),
      switchOnRule: on(settings.marketplace_switch_on),
      planLimits: on(settings.plan_limits),
      marketplaceFee: on(settings.marketplace_fee),
      flags: on(settings.feature_flags),
    },
  };
}
