/**
 * Setting up a school (AUTH-05, PRD 10.5, M5-11): what it is called, its logo, its main postcode
 * and roughly how many instructors teach there, then a link for each instructor it invites.
 *
 * Shared by the forms and their Server Actions, as the instructor's onboarding is.
 */

import { z } from '../zod';
import { isPostcode, normalisePostcode } from '../postcode.ts';
import { emailSchema, ukMobileSchema } from './auth.ts';

/** A school is a Business, and a Business is named in 1 to 120 characters. */
export const schoolNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your school name' })
  .max(120, { error: 'Use 120 characters or fewer' });

/** The database takes 1 to 500, which covers the largest schools there are. */
export const maxExpectedInstructors = 500;

/** Who sells a school's lessons: the school, its instructors each through their own Business, or both (D-281). */
export const lessonSellerSchema = z.enum(['school', 'instructors', 'both'], { error: 'Choose who sells your lessons' });
export type LessonSeller = z.infer<typeof lessonSellerSchema>;

/** The owner's answer on its own, from Settings. */
export const lessonSellerChoiceSchema = z.object({ lessonSeller: lessonSellerSchema });

export const schoolDetailsSchema = z.object({
  name: schoolNameSchema,
  lessonSeller: lessonSellerSchema,
  /**
   * Where the prepared logo was stored. Absent leaves the logo alone, null removes it. The
   * server checks the path is in the school's own folder before saving it.
   */
  logoPath: z.string().max(200).nullish(),
  postcode: z
    .string()
    .trim()
    .refine(isPostcode, { error: 'Enter a UK postcode like M1 1AE' })
    .transform((value) => normalisePostcode(value) ?? value),
  /** Typed into a box, so it arrives as text. Roughly is fine: it sizes nothing yet. */
  expectedInstructors: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, { error: 'Enter how many instructors teach for you, like 6' })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, { error: 'Enter at least 1' })
        .max(maxExpectedInstructors, { error: `Enter ${String(maxExpectedInstructors)} or fewer` }),
    ),
});

export type SchoolDetails = z.output<typeof schoolDetailsSchema>;

export const inviteChannelSchema = z.enum(['sms', 'whatsapp', 'email', 'link']);
export type InviteChannel = z.infer<typeof inviteChannelSchema>;

/**
 * One instructor invited to the school. The link is sent from the owner's own phone, so a
 * number or an address is needed only to open the message already addressed (D-118).
 */
/**
 * How somebody invited works with the school: teaching under it, with their own Business linked
 * (D-282), or helping run it as a manager, whom only the owner invites (D-293).
 */
export const instructorInviteKindSchema = z.enum(['member', 'link', 'manager']);
export type InstructorInviteKind = z.infer<typeof instructorInviteKindSchema>;

/** Which instructors a school invites, from who sells its lessons (D-281, D-282). */
export function inviteKindsFor(seller: LessonSeller | null): InstructorInviteKind[] {
  if (seller === 'instructors') return ['link'];
  if (seller === 'both') return ['member', 'link'];
  return ['member'];
}

export const instructorInviteSchema = z
  .object({
    kind: instructorInviteKindSchema.default('member'),
    channel: inviteChannelSchema,
    fullName: z.string().trim().max(120, { error: 'Use 120 characters or fewer' }),
    email: z.union([z.literal('').transform(() => null), emailSchema]),
    phone: z.union([z.literal('').transform(() => null), ukMobileSchema]),
  })
  .superRefine((value, context) => {
    if (value.channel === 'email' && value.email === null) {
      context.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address to send it to' });
    }
    if ((value.channel === 'sms' || value.channel === 'whatsapp') && value.phone === null) {
      context.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a mobile number to send it to' });
    }
  });

export type InstructorInvite = z.output<typeof instructorInviteSchema>;

/**
 * What a member may do beyond their role (SCH-02, PRD 6.2): an instructor setting their own
 * prices rather than teaching at the school's, and a manager seeing the school's revenue.
 */
export const memberPermissionKeys = ['set_own_prices', 'view_revenue'] as const;
export type MemberPermission = (typeof memberPermissionKeys)[number];

export const memberPermissionSchema = z.object({
  membershipId: z.uuid(),
  permission: z.enum(memberPermissionKeys),
  allowed: z.boolean(),
});

/** Switching somebody at the school off, or back on (SCH-02). */
export const memberSwitchSchema = z.object({
  membershipId: z.uuid(),
  active: z.boolean(),
});

/** The school answering for a trainee who teaches for it, or no longer (INS-04, R-18, D-342). */
export const memberSuperviseSchema = z.object({
  instructorId: z.uuid(),
  supervised: z.boolean(),
});

/** An invitation the school cancels. */
export const invitationIdSchema = z.uuid();

/**
 * Somebody asking a school for lessons, from its public page or typed in by its office (M9-15,
 * D-288): a name, a way to reach them, their postcode, what they want, and their agreement, which
 * the server keeps in the words shown beside the box.
 */
function enquirySchema(agreedError: string) {
  return z
    .object({
      fullName: z.string().trim().min(1, { error: 'Enter a name' }).max(120, { error: 'Use 120 characters or fewer' }),
      email: z.union([z.literal('').transform(() => null), emailSchema]),
      phone: z.union([z.literal('').transform(() => null), ukMobileSchema]),
      postcode: z
        .string()
        .trim()
        .refine(isPostcode, { error: 'Enter a UK postcode like M1 1AE' })
        .transform((value) => normalisePostcode(value) ?? value),
      transmission: z.enum(['', 'manual', 'automatic']).default(''),
      note: z.string().trim().max(500, { error: 'Use 500 characters or fewer' }).default(''),
      // A box, ticked or not, and only ticked will do.
      agreed: z.boolean().refine((ticked) => ticked, { error: agreedError }),
    })
    .superRefine((value, context) => {
      if (value.email === null && value.phone === null) {
        context.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address or a mobile number' });
      }
    });
}

export const schoolEnquirySchema = enquirySchema('Tick this so the school can pass your details to an instructor');
export const officeEnquirySchema = enquirySchema('Tick this once they have agreed');
export type SchoolEnquiry = z.output<typeof schoolEnquirySchema>;

/** What somebody asking for lessons agrees to, as the box shows it and the school keeps it. */
export function enquiryConsentWords(school: string): string {
  return `I agree to ${school} keeping these details and passing them to one of its instructors, who will contact me about lessons.`;
}

/** What the office says the person agreed to, when it types them in. */
export function officeEnquiryConsentWords(school: string): string {
  return `They agreed to ${school} keeping these details and passing them to one of its instructors, who will contact them about lessons.`;
}

/** An enquiry closed, with why if the school likes. */
export const closeEnquirySchema = z.object({
  enquiryId: z.uuid(),
  reason: z.string().trim().max(200, { error: 'Use 200 characters or fewer' }).default(''),
});

/** How long linked instructors have to answer an offer of a pupil, in hours (D-289). */
export const offerWindows = [
  { value: '4', label: '4 hours' },
  { value: '24', label: 'A day' },
  { value: '48', label: '2 days' },
  { value: '168', label: 'A week' },
] as const;

/** A new pupil offered to instructors linked to the school: the first to accept gets them (M9-17, D-289). */
export const offerEnquirySchema = z.object({
  enquiryId: z.uuid(),
  linkIds: z.array(z.uuid()).min(1, { error: 'Choose at least one instructor' }).max(30),
  hours: z.enum(['4', '24', '48', '168'], { error: 'Choose how long they have to answer' }).transform(Number),
});

/** A new pupil given to one of the school's own instructors (M9-18, D-289). */
export const giveEnquirySchema = z.object({
  enquiryId: z.uuid(),
  instructorId: z.uuid({ error: 'Choose an instructor' }),
});

/** A linked instructor's answer to an offer of a pupil. */
export const answerOfferSchema = z.object({
  offerId: z.uuid(),
  accept: z.boolean(),
});

/** A learner's answer to moving with their instructor, or back to the school that introduced them (D-292). */
export const answerMoveSchema = z.object({
  moveId: z.uuid(),
  move: z.boolean(),
});
