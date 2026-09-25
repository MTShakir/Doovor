/**
 * Telling another instructor about it (D-205). Every Business has a code; somebody who starts a
 * Business from a link carrying that code earns the Business that sent them a month of the paid
 * plan.
 *
 * The month is recorded as earned and is not applied to anything, because nothing charges anybody
 * yet: subscription billing is Phase 2 (D-022), and when the month lands is the product owner's
 * to settle. What is here is the part that cannot wait, because it can only be collected as it
 * happens: who came from whose link.
 */

/**
 * The letters and digits a code is made of: no I, O, 0 or 1, so a code read off a phone screen
 * and typed into another one comes out the same.
 */
export const referralCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const referralCodeLength = 8;

/** What one referral earns, in months of the paid plan. */
export const referralRewardMonths = 1;

const CODE = new RegExp(`^[${referralCodeAlphabet}]{${String(referralCodeLength)}}$`);

/**
 * A code as somebody might give it: spaces and dashes taken out and lower case lifted. Empty
 * when what is left could never be a code, so a caller has one thing to check rather than two.
 *
 * Nothing is substituted for anything. The alphabet leaves out the characters that get confused,
 * so a code with an O or a 1 in it is not a mistyped code, it is not a code.
 */
export function normaliseReferralCode(value: string): string {
  const tidied = value.replace(/[\s-]/g, '').toUpperCase();
  return CODE.test(tidied) ? tidied : '';
}

export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

/** The link somebody shares. The code rides as `ref`, so it works on any page of the site. */
export function referralLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, '')}/start?ref=${encodeURIComponent(code)}`;
}

/**
 * The words that go with a shared referral link.
 *
 * It says what the person reading it gets, which is the free start every new Business gets, and
 * claims nothing on their behalf. The month is the sender's, and putting it in their own message
 * to a colleague would be a strange thing to read.
 */
export function referralShareMessage(brandName: string, link: string): string {
  return `I run my driving lessons through ${brandName}: diary, payments and learner progress in one app. You can start free here: ${link}`;
}
