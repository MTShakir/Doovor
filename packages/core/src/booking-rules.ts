/**
 * The settings that decide what a learner may book, and when (PRD 11.1, DIA-05, DIA-06,
 * BOK-06, M1-18).
 *
 * Three levels, each overriding the one before: what the platform ships with, what the
 * Business changed, and the two an instructor owns for their own diary. Anything missing at a
 * level falls through to the one below, so a Business that has changed nothing is not carrying
 * a copy of the defaults it would then never see updated.
 */

import { z } from './zod';
import { reminderHoursDefault, reminderHoursSchema, resolveReminderHours } from './reminders.ts';

export interface BookingRules {
  /** Minutes between lessons, for travel. Instructor level. */
  bufferMinutes: number;
  /** How soon before a lesson it can still be booked. */
  noticeHours: number;
  /** How far ahead the diary is open. */
  horizonWeeks: number;
  /** Free cancellation up to this long before. */
  cancellationWindowHours: number;
  /** Charged for a late cancellation. */
  lateFeePercent: number;
  /** How long a request waits for an answer before it lapses. */
  requestExpiryHours: number;
  /** Instructor level: a booking is confirmed at once rather than asked for. */
  instantBook: boolean;
  /** How long before a lesson learners are reminded (NTF-02). */
  reminderHoursBefore: number[];
}

/** What the platform ships with (PRD 11.1). Matches `platform_settings.booking_defaults`. */
export const bookingRuleDefaults: BookingRules = {
  bufferMinutes: 30,
  noticeHours: 24,
  horizonWeeks: 8,
  cancellationWindowHours: 48,
  lateFeePercent: 100,
  requestExpiryHours: 12,
  instantBook: true,
  reminderHoursBefore: [...reminderHoursDefault],
};

/** The ranges from PRD 11.1, enforced here, in the database and in the form. */
export const bookingRuleRanges = {
  bufferMinutes: { min: 0, max: 60 },
  noticeHours: { min: 0, max: 72 },
  horizonWeeks: { min: 1, max: 26 },
  cancellationWindowHours: { min: 0, max: 72 },
  requestExpiryHours: { min: 1, max: 48 },
} as const;

/** A late cancellation costs nothing, half or all of the lesson. Nothing in between. */
export const lateFeePercents = [0, 50, 100] as const;

function whole(field: keyof typeof bookingRuleRanges, error: string) {
  const { min, max } = bookingRuleRanges[field];
  return z.coerce.number({ error }).int({ error }).min(min, { error }).max(max, { error });
}

/** What a Business may change. The two an instructor owns are not here (DIA-05). */
export const businessBookingRulesSchema = z.object({
  noticeHours: whole('noticeHours', 'Choose between 0 and 72 hours'),
  horizonWeeks: whole('horizonWeeks', 'Choose between 1 and 26 weeks'),
  cancellationWindowHours: whole('cancellationWindowHours', 'Choose between 0 and 72 hours'),
  lateFeePercent: z.coerce
    .number({ error: 'Choose 0, 50 or 100 per cent' })
    .refine((value) => (lateFeePercents as readonly number[]).includes(value), {
      error: 'Choose 0, 50 or 100 per cent',
    }),
  requestExpiryHours: whole('requestExpiryHours', 'Choose between 1 and 48 hours'),
  /** How long before a lesson learners are reminded (NTF-02). A form sends "24,2". */
  reminderHoursBefore: z
    .union([z.string(), z.array(z.coerce.number())])
    .default(() => [...reminderHoursDefault])
    .transform((value, ctx): number[] => {
      const hours =
        typeof value === 'string'
          ? value
              .split(',')
              .map((part) => Number(part.trim()))
              .filter((one) => Number.isFinite(one))
          : value;
      const parsed = reminderHoursSchema.safeParse(hours);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Choose when to remind learners' });
        return [];
      }
      return parsed.data;
    }),
});

/** What an instructor owns for their own diary (PRD 11.1, BOK-06). */
export const instructorBookingRulesSchema = z.object({
  bufferMinutes: whole('bufferMinutes', 'Choose between 0 and 60 minutes'),
  instantBook: z.boolean(),
});

export type BusinessBookingRules = z.infer<typeof businessBookingRulesSchema>;
export type InstructorBookingRules = z.infer<typeof instructorBookingRulesSchema>;

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The rules that actually apply to one instructor's diary: platform, then Business, then the
 * instructor's own two.
 */
export function resolveBookingRules(
  platform: Record<string, unknown> | null | undefined,
  business: Record<string, unknown> | null | undefined,
  instructor: { bufferMinutes?: number | null; instantBook?: boolean | null } | null | undefined,
): BookingRules {
  const level = (key: string, fallback: number): number =>
    numberOr(business?.[key], numberOr(platform?.[key], fallback));

  return {
    bufferMinutes: numberOr(instructor?.bufferMinutes, level('buffer_minutes', bookingRuleDefaults.bufferMinutes)),
    noticeHours: level('notice_hours', bookingRuleDefaults.noticeHours),
    horizonWeeks: level('horizon_weeks', bookingRuleDefaults.horizonWeeks),
    cancellationWindowHours: level('cancellation_window_hours', bookingRuleDefaults.cancellationWindowHours),
    lateFeePercent: level('late_fee_percent', bookingRuleDefaults.lateFeePercent),
    requestExpiryHours: level('request_expiry_hours', bookingRuleDefaults.requestExpiryHours),
    instantBook: instructor?.instantBook ?? bookingRuleDefaults.instantBook,
    reminderHoursBefore: resolveReminderHours(business, platform),
  };
}
