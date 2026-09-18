/**
 * The platform settings a super admin looks after (ADM-05): what each form accepts, and the shape
 * the platform settings keep it in. The database checks the same bounds again (D-128).
 */

import { z } from './zod';
import { businessBookingRulesSchema, bookingRuleRanges } from './booking-rules.ts';
import { parsePoundsToPence } from './money.ts';

/** A setting as the platform settings keep it: plain JSON. */
export type SettingValue = Record<string, number | boolean | number[] | Record<string, number>>;

function whole(min: number, max: number, error: string) {
  return z.coerce.number({ error }).int({ error }).min(min, { error }).max(max, { error });
}

/** The default booking rules: what a Business may change, and the gap between lessons (PRD 11.1). */
export const bookingDefaultsSchema = businessBookingRulesSchema.extend({
  bufferMinutes: whole(bookingRuleRanges.bufferMinutes.min, bookingRuleRanges.bufferMinutes.max, 'Choose between 0 and 60 minutes'),
});

export type BookingDefaults = z.infer<typeof bookingDefaultsSchema>;

export function bookingDefaultsSetting(rules: BookingDefaults): SettingValue {
  return {
    buffer_minutes: rules.bufferMinutes,
    notice_hours: rules.noticeHours,
    horizon_weeks: rules.horizonWeeks,
    cancellation_window_hours: rules.cancellationWindowHours,
    late_fee_percent: rules.lateFeePercent,
    request_expiry_hours: rules.requestExpiryHours,
    reminder_hours_before: rules.reminderHoursBefore,
  };
}

/** The regional switch-on rule (PRD 4.2). */
export const switchOnRuleSchema = z.object({
  instructors: whole(1, 1000, 'Choose between 1 and 1,000 instructors'),
  hours: whole(1, 100_000, 'Choose between 1 and 100,000 hours'),
});

export function switchOnRuleSetting(rule: z.infer<typeof switchOnRuleSchema>): SettingValue {
  return { verified_instructors: rule.instructors, open_hours_14_days: rule.hours };
}

/** Text message reminders each paid plan includes a month (PRD 9.18, NTF-01). */
export const planLimitsSchema = z.object({
  proSms: whole(0, 10_000, 'Choose between 0 and 10,000 texts'),
  schoolSms: whole(0, 10_000, 'Choose between 0 and 10,000 texts'),
});

export function planLimitsSetting(limits: z.infer<typeof planLimitsSchema>): SettingValue {
  return { pro: { sms_reminders_per_month: limits.proSms }, school: { sms_reminders_per_month: limits.schoolSms } };
}

/** The booking fee on a learner's first marketplace booking with an instructor, from Phase 3 (PRD 9.18). */
export const marketplaceFeeSchema = z.object({
  percent: whole(0, 20, 'Choose between 0 and 20 per cent'),
  cap: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const pence = parsePoundsToPence(value);
      if (pence === null || pence > 2000) {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount up to £20, like 2 or 1.50' });
        return z.NEVER;
      }
      return pence;
    }),
});

export function marketplaceFeeSetting(fee: z.infer<typeof marketplaceFeeSchema>): SettingValue {
  return { percent: fee.percent, cap_pence: fee.cap };
}

/** The features that are switched on for everybody (ADM-05). */
export const featureFlagsSchema = z.object({
  googleSignIn: z.boolean(),
  appleSignIn: z.boolean(),
  marketplace: z.boolean(),
});

export function featureFlagsSetting(flags: z.infer<typeof featureFlagsSchema>): SettingValue {
  return { google_sign_in: flags.googleSignIn, apple_sign_in: flags.appleSignIn, marketplace: flags.marketplace };
}
