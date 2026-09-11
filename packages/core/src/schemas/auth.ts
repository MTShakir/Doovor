/** Shared by the sign-in forms (React Hook Form) and their Server Actions. */
import { z } from 'zod';
import { normaliseUkMobile } from '../phone.ts';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Enter an email address like name@example.com' }));

// NCSC guidance: length over composition rules. 72 is the bcrypt limit.
export const passwordSchema = z
  .string()
  .min(8, { error: 'Use at least 8 characters' })
  .max(72, { error: 'Use 72 characters or fewer' });

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter your name' })
  .max(120, { error: 'Use 120 characters or fewer' });

export const intendedRoleSchema = z.enum(['learner', 'instructor', 'school']);
export type IntendedRole = z.infer<typeof intendedRoleSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password' }),
});

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: intendedRoleSchema,
    schoolName: z.string().trim().max(120).optional(),
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

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, { error: 'Enter the 6-digit code' });

export const phoneCodeSchema = z.object({ phone: ukMobileSchema, code: otpCodeSchema });

export const roleChoiceSchema = z
  .object({ role: intendedRoleSchema, schoolName: z.string().trim().max(120).optional() })
  .refine((value) => value.role !== 'school' || (value.schoolName?.length ?? 0) > 0, {
    path: ['schoolName'],
    error: 'Enter your school name',
  });

export const newPasswordSchema = z.object({ password: passwordSchema });
