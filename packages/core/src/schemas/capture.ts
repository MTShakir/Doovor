/**
 * Coming soon: joining an area's waiting list, or posting a lesson request, where learners cannot
 * yet find instructors through us (MKT-10, PRD 4.2, M5-10).
 *
 * The consent words are built here from the postcode's area, shown next to the box, and kept with
 * the entry exactly as shown, so what somebody agreed to is always on record.
 */

import { z } from '../zod';
import { areaOf, isPostcode, normalisePostcode } from '../postcode.ts';
import { emailSchema, fullNameSchema, ukMobileSchema } from './auth.ts';

export const postcodeField = z
  .string()
  .trim()
  .refine(isPostcode, { error: 'Enter a UK postcode like LS1 4DY' })
  .transform((value) => normalisePostcode(value) ?? value);

export const areaCheckSchema = z.object({ postcode: postcodeField });

/** What a learner is happy to learn in; 'both' is either. */
export const captureTransmissions = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'both', label: 'Either' },
] as const;

export const requestExperience = [
  { value: 'none', label: 'I have never driven' },
  { value: 'some', label: 'I have had some lessons' },
  { value: 'test_booked', label: 'My test is booked' },
] as const;

/** ISO weekdays, Monday 1 to Sunday 7, as the database keeps them. */
export const requestDays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
] as const;

export const requestTimes = [
  { value: 'morning', label: 'Mornings' },
  { value: 'afternoon', label: 'Afternoons' },
  { value: 'evening', label: 'Evenings' },
] as const;

export const requestStarts = [
  { value: 'now', label: 'As soon as I can' },
  { value: 'this_month', label: 'Within a month' },
  { value: 'later', label: 'Later than that' },
] as const;

const consentField = z.literal(true, { error: 'Tick the box so we may keep this and email you about it' });

export const waitingListSchema = z.object({
  postcode: postcodeField,
  fullName: fullNameSchema,
  email: emailSchema,
  // Nothing chosen is a learner who does not mind.
  transmission: z
    .enum(['manual', 'automatic', 'both'])
    .or(z.literal(''))
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  consent: consentField,
});

/** Pounds as typed, "40" or "42.50", to whole pence; empty is no budget given. */
const budgetField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{1,3}(\.\d{1,2})?$/.test(value), { error: 'Enter an amount in pounds, like 40' })
  .transform((value) => (value === '' ? null : Math.round(Number(value) * 100)))
  .refine((pence) => pence === null || (pence >= 100 && pence <= 20000), { error: 'Enter an amount between £1 and £200' });

export const lessonRequestSchema = z.object({
  postcode: postcodeField,
  fullName: fullNameSchema,
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null;
      const parsed = ukMobileSchema.safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Enter a UK mobile number like 07700 900123, or leave it empty' });
        return z.NEVER;
      }
      return parsed.data;
    }),
  transmission: z.enum(['manual', 'automatic', 'both'], { error: 'Choose manual, automatic or either' }),
  experience: z.enum(['none', 'some', 'test_booked'], { error: 'Choose how far along you are' }),
  days: z.array(z.number().int().min(1).max(7)).min(1, { error: 'Choose at least one day' }),
  times: z.array(z.enum(['morning', 'afternoon', 'evening'])).min(1, { error: 'Choose at least one time of day' }),
  startWhen: z.enum(['now', 'this_month', 'later'], { error: 'Choose when you would like to start' }),
  budget: budgetField,
  consent: consentField,
});

export type WaitingListInput = z.input<typeof waitingListSchema>;
export type LessonRequestInput = z.input<typeof lessonRequestSchema>;

/** The area a consent is for: "LS" from "LS6 3QS". */
function areaFor(postcode: string): string {
  return areaOf(postcode) ?? postcode.trim().toUpperCase();
}

/** The words agreed to when joining an area's waiting list. */
export function waitingListConsent(postcode: string): string {
  return `Keep my details and email me when I can find and book driving instructors near ${areaFor(postcode)}. I can leave the list at any time.`;
}

export type CaptureKind = 'waiting_list' | 'lesson_request';

export interface CaptureConfirmationWords {
  title: string;
  body: string;
  action: string;
  /** Why the email came, for its footer: these people need not have an account (MKT-10). */
  reason: string;
}

/** Why somebody who gave their details, with or without an account, is getting an email about it. */
function captureReason(kind: CaptureKind, postcodeArea: string): string {
  return kind === 'waiting_list'
    ? `you joined the waiting list for ${postcodeArea}`
    : `you sent us a lesson request for ${postcodeArea}`;
}

/**
 * The email that confirms a place on a waiting list or a lesson request. Its one button removes
 * everything kept for the address, so somebody who never asked for it can undo it at once.
 */
export function captureConfirmationWords(kind: CaptureKind, postcodeArea: string): CaptureConfirmationWords {
  const undo = 'If this was not you, or you change your mind, remove your details with the button below.';
  return kind === 'waiting_list'
    ? {
        title: `You are on the waiting list for ${postcodeArea}`,
        body: `We will email you when you can find and book driving instructors near ${postcodeArea}. ${undo}`,
        action: 'Remove my details',
        reason: captureReason(kind, postcodeArea),
      }
    : {
        title: `We have your lesson request for ${postcodeArea}`,
        body: `We will email you about it when instructors near ${postcodeArea} can take bookings through the app. ${undo}`,
        action: 'Remove my details',
        reason: captureReason(kind, postcodeArea),
      };
}

/**
 * The one email somebody waiting in an area gets when the marketplace opens there, as their consent
 * promised (D-117, D-127). A place on the waiting list has done its job and is left; a lesson request
 * stays until its sender removes it.
 */
export function regionOpenedWords(kind: CaptureKind, postcodeArea: string): CaptureConfirmationWords {
  const title = `Driving instructors near ${postcodeArea} are taking bookings`;
  return kind === 'waiting_list'
    ? {
        title,
        body: `You asked us to email you when you could find and book driving instructors near ${postcodeArea}, and now you can. We have taken you off the waiting list, so this is the only email about it.`,
        action: 'Find an instructor',
        reason: captureReason(kind, postcodeArea),
      }
    : {
        title,
        body: `You asked us to email you about your lesson request when instructors near ${postcodeArea} could take bookings through the app, and now they can. We keep your request until you remove it, with the button in the email that confirmed it, or reply to this email and we will remove it for you.`,
        action: 'Find an instructor',
        reason: captureReason(kind, postcodeArea),
      };
}

/** The words agreed to when posting a lesson request. */
export function lessonRequestConsent(postcode: string): string {
  return `Keep my lesson request and email me about it when instructors near ${areaFor(postcode)} can take bookings through the app. I can withdraw it at any time.`;
}
