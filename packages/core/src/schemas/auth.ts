/** Shared by the sign-in forms (React Hook Form) and their Server Actions. */
import { z } from '../zod';
import { normaliseUkMobile } from '../phone.ts';
import { cleanTag, isHeardAbout, type HeardAbout } from '../visits.ts';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Enter an email address like name@example.com' }));

/**
 * The shortest password anybody can choose. NCSC guidance: length over composition rules. Ten
 * rather than eight while the hosted project has no check against leaked passwords, which comes
 * with Supabase Pro (D-161). Supabase Auth is set to the same number, and a test holds the two
 * together (packages/db/src/auth-limits.test.ts). Signing in asks for no length at all, so a
 * password chosen when eight was enough still works.
 */
export const passwordMinLength = 10;

// 72 is the bcrypt limit.
export const passwordSchema = z
  .string()
  .min(passwordMinLength, { error: `Use at least ${String(passwordMinLength)} characters` })
  .max(72, { error: 'Use 72 characters or fewer' });

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your name' })
  .max(120, { error: 'Use 120 characters or fewer' });

/** Somebody else's name, typed in by whoever is adding them, who is not the one it is missing from. */
export const theirNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter their name' })
  .max(120, { error: 'Use 120 characters or fewer' });

export const intendedRoleSchema = z.enum(['learner', 'instructor', 'school']);
export type IntendedRole = z.infer<typeof intendedRoleSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password' }),
});

/** A tag carried on from the link somebody arrived on. One that is not a plain word is dropped, never refused (D-413). */
const carriedTagSchema = z
  .string()
  .max(200)
  .nullish()
  .transform((value) => cleanTag(value));

/** Where somebody came from, carried on to sign-up from the link they arrived on (D-413). */
export const arrivalTagsSchema = z
  .object({ source: carriedTagSchema, medium: carriedTagSchema, campaign: carriedTagSchema })
  .nullish()
  .transform((tags) => ({ source: tags?.source ?? null, medium: tags?.medium ?? null, campaign: tags?.campaign ?? null }));

/** "How did you hear about us?": optional, and anything that is not one of the answers is no answer (D-413). */
export const heardAboutSchema = z
  .string()
  .max(40)
  .nullish()
  .transform((value): HeardAbout | null => (isHeardAbout(value) ? value : null));

/** Where else, in their own words, when the answer is "Somewhere else". */
export const heardAboutOtherSchema = z.string().trim().max(80, { error: 'Use 80 characters or fewer' }).nullish();

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: intendedRoleSchema,
    schoolName: z.string().trim().max(120).optional(),
    arrival: arrivalTagsSchema,
    heardAbout: heardAboutSchema,
    heardAboutOther: heardAboutOtherSchema,
    /** The terms and the privacy notice, agreed to with a tick: never assumed (NFR-PRV-02, D-265). */
    acceptedTerms: z.boolean({ error: 'Agree to the terms to create your account' }).refine((agreed) => agreed, {
      error: 'Agree to the terms to create your account',
    }),
  })
  .refine((value) => value.role !== 'school' || (value.schoolName?.length ?? 0) > 0, {
    path: ['schoolName'],
    error: 'Enter your school name',
  });

export const magicLinkSchema = z.object({ email: emailSchema });

export const ukMobileSchema = z.string().transform((value, ctx) => {
  const normalised = normaliseUkMobile(value);
  if (!normalised) {
    ctx.addIssue({ code: 'custom', message: 'Enter a UK mobile number like 07700 900123' });
    return z.NEVER;
  }
  return normalised;
});

/**
 * A UK mobile, or an empty box, which is null. Not a union of the two: a union that fails both
 * ways says only "Invalid input", which tells somebody who typed a landline nothing (D-381).
 */
export const optionalUkMobileSchema = z.string().transform((value, ctx) => {
  if (value.trim() === '') return null;
  const normalised = normaliseUkMobile(value);
  if (!normalised) {
    ctx.addIssue({ code: 'custom', message: 'Enter a UK mobile number like 07700 900123, or leave it empty' });
    return z.NEVER;
  }
  return normalised;
});

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, { error: 'Enter the 6-digit code' });

export const phoneCodeSchema = z.object({ phone: ukMobileSchema, code: otpCodeSchema });

export const roleChoiceSchema = z
  .object({
    role: intendedRoleSchema,
    schoolName: z.string().trim().max(120).optional(),
    arrival: arrivalTagsSchema,
    heardAbout: heardAboutSchema,
    heardAboutOther: heardAboutOtherSchema,
  })
  .refine((value) => value.role !== 'school' || (value.schoolName?.length ?? 0) > 0, {
    path: ['schoolName'],
    error: 'Enter your school name',
  });

export const newPasswordSchema = z.object({ password: passwordSchema });
