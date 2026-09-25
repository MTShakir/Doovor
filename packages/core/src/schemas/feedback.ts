/**
 * Telling us something (D-202). Shared by the form and the Server Action, so the same rules
 * decide both and the words a person reads are written once.
 */

import { z } from '../zod';

export const feedbackKinds = ['feature', 'feedback', 'issue', 'other'] as const;

export type FeedbackKind = (typeof feedbackKinds)[number];

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && (feedbackKinds as readonly string[]).includes(value);
}

/** What each choice is called, in the words somebody would use to pick it. */
export const feedbackKindLabels: Record<FeedbackKind, string> = {
  feature: 'Request a feature',
  feedback: 'Give feedback',
  issue: 'Report a problem',
  other: 'Something else',
};

/** What each one is for, under the picker. */
export const feedbackKindHints: Record<FeedbackKind, string> = {
  feature: 'Something the app does not do yet that would help you.',
  feedback: 'What is working, what is not, what you would change.',
  issue: 'Something that went wrong. Say what you were doing when it did.',
  other: 'Anything the others do not cover.',
};

/** Three pictures is enough to show a problem and few enough to send on a phone. */
export const mostFeedbackImages = 3;

export const feedbackInputSchema = z.object({
  kind: z.enum(feedbackKinds),
  message: z
    .string()
    .trim()
    .min(1, { error: 'Tell us what happened' })
    .max(4000, { error: 'Keep it to 4000 characters' }),
  /** Where the prepared pictures were stored. The server checks each one is theirs. */
  images: z.array(z.string().max(200)).max(mostFeedbackImages).default([]),
  /** The screen they were on, so a report can be placed without asking. */
  page: z.string().max(200).default(''),
});

export type FeedbackInput = z.input<typeof feedbackInputSchema>;
export type Feedback = z.output<typeof feedbackInputSchema>;

/**
 * What staff are looking at, as the address carries it (D-202): one kind at a time or all of them,
 * only what nobody has dealt with yet, and how far down the list they have paged.
 */
/** A parameter's value in an address, the first one where it comes more than once. */
function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export const adminFeedbackSearchSchema = z.object({
  kind: z.preprocess(firstOf, z.enum(feedbackKinds).optional()).catch(undefined),
  onlyNew: z.preprocess((value) => firstOf(value) === 'new', z.boolean()).catch(false),
  page: z.preprocess((value) => Number(firstOf(value) ?? 1), z.number().int().min(1).max(200)).catch(1),
});

export type AdminFeedbackSearch = z.output<typeof adminFeedbackSearchSchema>;

/** How many reports staff read at a time. */
export const feedbackPageSize = 25;
