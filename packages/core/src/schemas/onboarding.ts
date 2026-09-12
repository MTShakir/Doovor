/**
 * Instructor onboarding, one schema per step (AUTH-04, M1-02).
 *
 * Shared by the client form and the Server Action so the same rules decide both, and later by
 * the mobile app. Steps added in M1-04 onwards join this file.
 */

import { z } from 'zod';
import { fullNameSchema } from './auth.ts';

/** Step 1: the name learners see, and the photo shown beside it (INS-01). */
export const onboardingNameSchema = z.object({
  fullName: fullNameSchema,
  /**
   * Where the prepared picture was stored. Absent means the photo is unchanged, null removes
   * it. The server checks the path belongs to the caller before saving it.
   */
  photoPath: z.string().max(200).nullish(),
});

export type OnboardingName = z.infer<typeof onboardingNameSchema>;
