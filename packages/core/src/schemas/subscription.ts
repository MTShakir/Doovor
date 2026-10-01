import { z } from 'zod';

/**
 * What a browser is allowed to say about a subscription (9.18, D-231).
 *
 * All it may say is how often to bill: there is no price here, no plan key, no discount and no
 * number of banked months, because every one of those is worked out on the server from the plan
 * and from what the Business has already paid. A request to subscribe carries one word.
 *
 * That is deliberate and it is the whole of the protection. A field for the amount would be a
 * field somebody could change in the network tab, however carefully the screen filled it in.
 */
export const startProCheckoutSchema = z.object({
  interval: z.enum(['month', 'year']),
});

export type StartProCheckoutInput = z.infer<typeof startProCheckoutSchema>;

/** Stopping at the end of the period, or changing your mind and carrying on. */
export const setProRenewalSchema = z.object({
  cancel: z.boolean(),
});

export type SetProRenewalInput = z.infer<typeof setProRenewalSchema>;
