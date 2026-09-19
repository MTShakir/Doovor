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

export const schoolDetailsSchema = z.object({
  name: schoolNameSchema,
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
export const instructorInviteSchema = z
  .object({
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

/** An invitation the school cancels. */
export const invitationIdSchema = z.uuid();
