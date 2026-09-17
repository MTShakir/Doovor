import { describe, expect, it } from 'vitest';
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
} from './platform-settings';

describe('platform settings as a super admin edits them (ADM-05, M5-20)', () => {
  it('keeps the default booking rules the way the database reads them', () => {
    const rules = bookingDefaultsSchema.parse({
      bufferMinutes: '15',
      noticeHours: '12',
      horizonWeeks: '10',
      cancellationWindowHours: '24',
      lateFeePercent: '50',
      requestExpiryHours: '6',
      reminderHoursBefore: '2,48',
    });
    expect(bookingDefaultsSetting(rules)).toEqual({
      buffer_minutes: 15,
      notice_hours: 12,
      horizon_weeks: 10,
      cancellation_window_hours: 24,
      late_fee_percent: 50,
      request_expiry_hours: 6,
      reminder_hours_before: [48, 2],
    });
  });

  it('refuses a gap between lessons beyond an hour (PRD 11.1)', () => {
    const tooLong = bookingDefaultsSchema.safeParse({
      bufferMinutes: '90',
      noticeHours: '12',
      horizonWeeks: '10',
      cancellationWindowHours: '24',
      lateFeePercent: '50',
      requestExpiryHours: '6',
      reminderHoursBefore: '24,2',
    });
    expect(tooLong.error?.issues[0]).toMatchObject({ path: ['bufferMinutes'], message: 'Choose between 0 and 60 minutes' });
  });

  it('keeps the switch-on rule, never for nobody (PRD 4.2)', () => {
    expect(switchOnRuleSetting(switchOnRuleSchema.parse({ instructors: '30', hours: '200' }))).toEqual({ verified_instructors: 30, open_hours_14_days: 200 });
    expect(switchOnRuleSchema.safeParse({ instructors: '0', hours: '200' }).success).toBe(false);
  });

  it('keeps the texts each paid plan includes (PRD 9.18)', () => {
    expect(planLimitsSetting(planLimitsSchema.parse({ proSms: '250', schoolSms: '400' }))).toEqual({
      pro: { sms_reminders_per_month: 250 },
      school: { sms_reminders_per_month: 400 },
    });
    expect(planLimitsSchema.safeParse({ proSms: '-1', schoolSms: '400' }).success).toBe(false);
  });

  it('keeps the marketplace fee, with its cap typed in pounds and kept in pence', () => {
    expect(marketplaceFeeSetting(marketplaceFeeSchema.parse({ percent: '5', cap: '£1.50' }))).toEqual({ percent: 5, cap_pence: 150 });
    expect(marketplaceFeeSchema.safeParse({ percent: '25', cap: '2' }).success).toBe(false);
    expect(marketplaceFeeSchema.safeParse({ percent: '5', cap: '21' }).error?.issues[0]?.message).toBe('Enter an amount up to £20, like 2 or 1.50');
  });

  it('keeps each feature flag by the name the settings use', () => {
    expect(featureFlagsSetting(featureFlagsSchema.parse({ googleSignIn: false, appleSignIn: true, marketplace: false }))).toEqual({
      google_sign_in: false,
      apple_sign_in: true,
      marketplace: false,
    });
    expect(featureFlagsSchema.safeParse({ googleSignIn: 'yes', appleSignIn: true, marketplace: false }).success).toBe(false);
  });
});
