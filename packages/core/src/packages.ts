/**
 * Lesson packages, as a learner is offered them (PAY-04, M3-13).
 *
 * A package is so many minutes of lessons for so much money with one Business, sometimes with a
 * number of days to use them in. Buying one gives the learner a lot of credit on exactly those
 * terms (credit.ts). This is what they are told before they decide.
 */

export interface PackageTerms {
  minutes: number;
  pricePence: number;
  /** Days to use the minutes in, counted from the day they are bought. Null when they never run out. */
  expiryDays: number | null;
}

/** What an hour of a package costs, to the nearest penny. */
export function pricePerHourPence(terms: Pick<PackageTerms, 'minutes' | 'pricePence'>): number {
  if (!Number.isSafeInteger(terms.minutes) || terms.minutes <= 0) {
    throw new RangeError(`a package has to buy whole minutes, got ${String(terms.minutes)}`);
  }
  if (!Number.isSafeInteger(terms.pricePence) || terms.pricePence < 0) {
    throw new RangeError(`price must be integer pence, got ${String(terms.pricePence)}`);
  }
  return Math.round((terms.pricePence * 60) / terms.minutes);
}

/** How long the hours last, as a sentence. Whole years are said in years. */
export function packageExpiryText(expiryDays: number | null): string {
  if (expiryDays === null) return 'The hours never run out.';
  if (!Number.isSafeInteger(expiryDays) || expiryDays <= 0) {
    throw new RangeError(`expiry must be a whole number of days, got ${String(expiryDays)}`);
  }
  if (expiryDays % 365 === 0) {
    const years = expiryDays / 365;
    return years === 1 ? 'Use them within a year of buying.' : `Use them within ${String(years)} years of buying.`;
  }
  return expiryDays === 1 ? 'Use them within a day of buying.' : `Use them within ${String(expiryDays)} days of buying.`;
}
