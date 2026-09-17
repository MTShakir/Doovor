import { z } from 'zod';

/** What platform staff type to find a Business or a person (ADM-02). */
export const adminSearchSchema = z.string().trim().max(100, { error: 'Use 100 characters or fewer' });

/** Why a Business or an account is suspended: kept with it, and in the audit log (ADM-02, NFR-SEC-06). */
export const suspensionReasonSchema = z
  .string()
  .trim()
  .min(1, { error: 'Say why, so whoever looks at it next knows' })
  .max(500, { error: 'Use 500 characters or fewer' });

export const businessIdSchema = z.object({ businessId: z.uuid() });

export const suspendBusinessSchema = z.object({ businessId: z.uuid(), reason: suspensionReasonSchema });

export const userIdSchema = z.object({ userId: z.uuid() });

export const suspendAccountSchema = z.object({ userId: z.uuid(), reason: suspensionReasonSchema });

/** A postcode area as typed: "ls" is "LS" (ADM-04). */
export const postcodeAreaSchema = z.object({
  area: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}$/, { error: 'A postcode area is one or two letters, like M or LS' }),
});
