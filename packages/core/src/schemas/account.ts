/**
 * What somebody can change about their own account (AUTH-09, D-217).
 *
 * The name is asked for in two halves for the same reason onboarding does (D-196): it says
 * plainly that we want the name they are known by rather than a business, and a browser fills
 * it. One name is stored.
 */

import { z } from '../zod';
import { businessNameSchema, nameHalfSchema } from './onboarding.ts';

export const accountNameSchema = z.object({
  firstName: nameHalfSchema.min(1, { error: 'Enter your first name' }),
  lastName: nameHalfSchema,
  /**
   * What the Business trades as. Only sent by somebody who owns a Business of their own: at a
   * school the name is not theirs to change (D-196), and the form does not show the field.
   */
  businessName: businessNameSchema.optional(),
});

export type AccountName = z.infer<typeof accountNameSchema>;
