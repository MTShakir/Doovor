import { describe, expect, it } from 'vitest';
import {
  bookingRuleDefaults,
  businessBookingRulesSchema,
  instructorBookingRulesSchema,
  resolveBookingRules,
} from './booking-rules.ts';

const platform = {
  buffer_minutes: 30,
  notice_hours: 24,
  horizon_weeks: 8,
  cancellation_window_hours: 48,
  late_fee_percent: 100,
  request_expiry_hours: 12,
};

function problem(schema: { safeParse: (input: unknown) => { success: boolean } }, input: unknown): boolean {
  return !schema.safeParse(input).success;
}

describe('booking rules (PRD 11.1, M1-18)', () => {
  it('falls back to what the platform ships with', () => {
    expect(resolveBookingRules(platform, null, null)).toEqual(bookingRuleDefaults);
    expect(resolveBookingRules(null, null, null)).toEqual(bookingRuleDefaults);
  });

  it('lets a Business change what is theirs', () => {
    const rules = resolveBookingRules(platform, { notice_hours: 48, horizon_weeks: 12 }, null);

    expect(rules.noticeHours).toBe(48);
    expect(rules.horizonWeeks).toBe(12);
    // Everything they did not change still follows the platform.
    expect(rules.cancellationWindowHours).toBe(48);
  });

  it('lets an instructor change the two that are theirs', () => {
    const rules = resolveBookingRules(platform, { notice_hours: 48 }, { bufferMinutes: 0, instantBook: false });

    expect(rules.bufferMinutes).toBe(0);
    expect(rules.instantBook).toBe(false);
    expect(rules.noticeHours).toBe(48);
  });

  it('ignores rubbish at any level rather than failing', () => {
    const rules = resolveBookingRules(platform, { notice_hours: 'soon' }, { bufferMinutes: null });

    expect(rules.noticeHours).toBe(24);
    expect(rules.bufferMinutes).toBe(30);
  });

  it('keeps the Business settings inside the ranges the product sets', () => {
    const valid = {
      noticeHours: 24,
      horizonWeeks: 8,
      cancellationWindowHours: 48,
      lateFeePercent: 100,
      requestExpiryHours: 12,
    };
    // Reminders default to the platform's, so a form that does not ask still saves (NTF-02).
    expect(businessBookingRulesSchema.parse(valid)).toEqual({ ...valid, reminderHoursBefore: [24, 2] });
    expect(businessBookingRulesSchema.parse({ ...valid, reminderHoursBefore: '72,24' })).toMatchObject({
      reminderHoursBefore: [72, 24],
    });
    expect(problem(businessBookingRulesSchema, { ...valid, noticeHours: 73 })).toBe(true);
    expect(problem(businessBookingRulesSchema, { ...valid, horizonWeeks: 0 })).toBe(true);
    expect(problem(businessBookingRulesSchema, { ...valid, horizonWeeks: 27 })).toBe(true);
    expect(problem(businessBookingRulesSchema, { ...valid, requestExpiryHours: 0 })).toBe(true);
    expect(problem(businessBookingRulesSchema, { ...valid, cancellationWindowHours: -1 })).toBe(true);
  });

  it('takes only the three late fees the product offers', () => {
    const valid = { noticeHours: 24, horizonWeeks: 8, cancellationWindowHours: 48, requestExpiryHours: 12 };
    for (const lateFeePercent of [0, 50, 100]) {
      expect(businessBookingRulesSchema.safeParse({ ...valid, lateFeePercent }).success).toBe(true);
    }
    expect(problem(businessBookingRulesSchema, { ...valid, lateFeePercent: 75 })).toBe(true);
  });

  it('keeps the buffer between nothing and an hour', () => {
    expect(instructorBookingRulesSchema.parse({ bufferMinutes: '45', instantBook: true }).bufferMinutes).toBe(45);
    expect(problem(instructorBookingRulesSchema, { bufferMinutes: 61, instantBook: true })).toBe(true);
    expect(problem(instructorBookingRulesSchema, { bufferMinutes: -1, instantBook: true })).toBe(true);
  });
});
