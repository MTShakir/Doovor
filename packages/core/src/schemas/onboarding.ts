/**
 * Instructor onboarding, one schema per step (AUTH-04, M1-02).
 *
 * Shared by the client form and the Server Action so the same rules decide both, and later by
 * the mobile app. Steps added in M1-03 onwards join this file.
 */

import { z } from 'zod';
import { fullNameSchema } from './auth.ts';

/** Step 1: the name learners see. The one step that cannot be skipped. */
export const onboardingNameSchema = z.object({ fullName: fullNameSchema });

export type OnboardingName = z.infer<typeof onboardingNameSchema>;
