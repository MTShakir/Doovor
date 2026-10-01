import { describe, expect, it } from 'vitest';
import {
  feedbackHandledWords,
  feedbackInputSchema,
  feedbackKinds,
  feedbackReceivedWords,
  feedbackReference,
  mostFeedbackImages,
} from './feedback.ts';

/**
 * What a report is called, and what we say to the person who sent it (D-202, D-241).
 *
 * The reference is made by the database, from a sequence. The shape of it is written down here so
 * a change to either side has to face the other.
 */

describe('what a report is called (D-241)', () => {
  it('starts at R01 and pads to two digits', () => {
    expect(feedbackReference(1)).toBe('R01');
    expect(feedbackReference(2)).toBe('R02');
    expect(feedbackReference(9)).toBe('R09');
  });

  it('keeps going past the first hundred rather than running out', () => {
    expect(feedbackReference(10)).toBe('R10');
    expect(feedbackReference(99)).toBe('R99');
    expect(feedbackReference(100)).toBe('R100');
    expect(feedbackReference(1234)).toBe('R1234');
  });

  it('never answers with something that is not a reference', () => {
    for (const odd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(feedbackReference(odd)).toBe('R01');
    }
    expect(feedbackReference(2.9)).toBe('R02');
  });
});

describe('what we say when a report arrives (D-241)', () => {
  it('leads with the reference, in the subject and in the words', () => {
    const words = feedbackReceivedWords('R07', 'issue');

    expect(words.title).toContain('R07');
    expect(words.body).toContain('R07');
    expect(words.body).toContain('quote that');
    expect(words.reason).not.toBe('');
  });

  it('says what it was about, in the words somebody would use for it', () => {
    expect(feedbackReceivedWords('R01', 'feature').body).toContain('a feature you asked for');
    expect(feedbackReceivedWords('R01', 'issue').body).toContain('a problem you reported');
    expect(feedbackReceivedWords('R01', 'feedback').body).toContain('your feedback');
    expect(feedbackReceivedWords('R01', 'other').body).toContain('what you told us');
  });

  it('promises that somebody will come back, and never says when', () => {
    const words = feedbackReceivedWords('R01', 'issue');

    expect(words.body).toContain('come back to you');
    // A date we might miss is worse than no date.
    expect(words.body).not.toMatch(/\b\d+\s*(hours?|days?|weeks?)\b/);
  });

  it('writes a line for every kind, with no empty words anywhere', () => {
    for (const kind of feedbackKinds) {
      for (const words of [feedbackReceivedWords('R42', kind), feedbackHandledWords('R42', kind)]) {
        expect(words.title.trim()).not.toBe('');
        expect(words.body.trim()).not.toBe('');
        expect(words.title).toContain('R42');
      }
    }
  });
});

describe('what we say when it has been dealt with (D-241)', () => {
  it('names the reference and says it is closed', () => {
    const words = feedbackHandledWords('R12', 'feature');

    expect(words.title).toBe('R12 has been dealt with');
    expect(words.body).toContain('closed');
  });

  it('invites them back rather than ending the conversation', () => {
    expect(feedbackHandledWords('R12', 'issue').body).toContain('tell us again');
  });
});

describe('what a report may say (D-202)', () => {
  it('takes a report with no pictures and no page', () => {
    const parsed = feedbackInputSchema.safeParse({ kind: 'issue', message: 'The diary will not load' });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ images: [], page: '' });
  });

  it('refuses an empty message, and one longer than anybody would write', () => {
    expect(feedbackInputSchema.safeParse({ kind: 'issue', message: '   ' }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: 'issue', message: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('refuses a kind nobody offers, and more pictures than the form allows', () => {
    expect(feedbackInputSchema.safeParse({ kind: 'invented', message: 'hello' }).success).toBe(false);
    expect(
      feedbackInputSchema.safeParse({
        kind: 'issue',
        message: 'hello',
        images: Array.from({ length: mostFeedbackImages + 1 }, (_, index) => `me/${String(index)}.webp`),
      }).success,
    ).toBe(false);
  });
});
