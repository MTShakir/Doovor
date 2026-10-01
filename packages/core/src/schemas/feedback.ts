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

/**
 * What a report is called when somebody writes to us about it (D-241). The database makes it, from
 * a sequence; this is here so the shape is written down once and a test can hold it to it.
 *
 * "R" and a number, zero padded to two digits. R01 through R09, then R10, R99, R100: the shape the
 * product owner asked for through the first hundred, with nothing special happening at the end of
 * it.
 */
export function feedbackReference(number: number): string {
  const whole = Number.isFinite(number) && number > 0 ? Math.floor(number) : 1;
  return `R${String(whole).padStart(2, '0')}`;
}

export interface FeedbackEmailWords {
  title: string;
  body: string;
  /** Why they are getting it, for the line at the bottom of the email. */
  reason: string;
}

/** What each kind is called in a sentence about it, rather than on a button. */
const aboutIt: Record<FeedbackKind, string> = {
  feature: 'a feature you asked for',
  feedback: 'your feedback',
  issue: 'a problem you reported',
  other: 'what you told us',
};

/**
 * The email somebody gets the moment their report arrives (D-241).
 *
 * It leads with the reference, because that is the one thing they may need to write down, and it
 * says plainly that a person will come back to them. Nothing in it promises when: a date we might
 * miss is worse than no date.
 */
export function feedbackReceivedWords(reference: string, kind: FeedbackKind): FeedbackEmailWords {
  return {
    title: `We have got your message, ${reference}`,
    body:
      `Thanks for telling us about ${aboutIt[kind]}. Your reference is ${reference}, so quote that if you ` +
      'write to us about it again. Somebody will look at it and come back to you. If anything else comes up ' +
      'in the meantime, tell us again.',
    reason: 'You are getting this because you sent us a message through the app.',
  };
}

/**
 * The email when a person has dealt with it (D-241). Said once, when it is first dealt with: staff
 * putting a report back is them correcting themselves, and nobody needs telling about that.
 */
export function feedbackHandledWords(reference: string, kind: FeedbackKind): FeedbackEmailWords {
  return {
    title: `${reference} has been dealt with`,
    body:
      `Somebody has looked at ${aboutIt[kind]}, and your report ${reference} is closed. If it is not sorted, ` +
      'or anything else comes up, tell us again and we will pick it up from there.',
    reason: 'You are getting this because you sent us a message through the app.',
  };
}

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
