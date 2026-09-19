/**
 * Where a lesson starts and ends (COV-04, M1-16).
 *
 * A learner has a few of these: home, their school or college, work, and the occasional one
 * off. One of them is the default, which is the one a booking screen offers first.
 */

import { z } from '../zod';
import { isPostcode, normalisePostcode } from '../postcode.ts';

export const pickupKinds = [
  { value: 'home', label: 'Home' },
  { value: 'school', label: 'School or college' },
  { value: 'work', label: 'Work' },
  { value: 'custom', label: 'Somewhere else' },
] as const;

export type PickupKind = (typeof pickupKinds)[number]['value'];

/** What to call it when the person has not said. */
export function defaultLabelFor(kind: PickupKind): string {
  return pickupKinds.find((item) => item.value === kind)?.label ?? 'Pickup point';
}

export const pickupPointSchema = z.object({
  kind: z.enum(['home', 'school', 'work', 'custom']),
  /** Shown in a list, so it has to be short. Left empty, the kind names it. */
  label: z.string().trim().max(60, { error: 'Use 60 characters or fewer' }),
  address: z
    .string()
    .trim()
    .min(1, { error: 'Enter the address' })
    .max(200, { error: 'Use 200 characters or fewer' }),
  postcode: z
    .string()
    .trim()
    .refine(isPostcode, { error: 'Enter a UK postcode like LS1 4DY' })
    .transform((value) => normalisePostcode(value) ?? value),
  isDefault: z.boolean(),
});

export type PickupPoint = z.infer<typeof pickupPointSchema>;
