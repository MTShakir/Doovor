/**
 * The founding places, as the public site counts them (D-203, D-243).
 *
 * The database gives out the places and counts them; this turns the count into what the page
 * shows, so the arithmetic and the words are tested once rather than on every page that uses
 * them. Every number here is the database's: nothing is rounded up, nothing is added for effect.
 */

export interface FoundingProgress {
  limit: number;
  /** Places given out, never more than the limit. */
  taken: number;
  left: number;
  /** How far along the bar is, from 0 to 100. */
  percent: number;
  /** All of them have gone, which changes what the page offers instead. */
  full: boolean;
}

/** A whole number of at least nought, from whatever arrived. */
function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * How far through the places are. Clamped, so a limit lowered below what was already given (which
 * the offer allows: anybody who has a place keeps it) reads as full rather than as more than full.
 */
export function foundingProgress(input: { limit: number; taken: number }): FoundingProgress {
  const limit = whole(input.limit);
  const taken = Math.min(whole(input.taken), limit);
  const left = limit - taken;
  return {
    limit,
    taken,
    left,
    percent: limit === 0 ? 100 : Math.round((taken / limit) * 100),
    full: left === 0,
  };
}

/**
 * The line beside the bar. At nought it says the places are open rather than "0 joined", which is
 * true and is what somebody reading it needs to know; after that it is the count, as asked.
 */
export function foundingCountWords(progress: FoundingProgress): { headline: string; detail: string } {
  if (progress.full) {
    return { headline: `All ${String(progress.limit)} places taken`, detail: 'The founding offer has closed.' };
  }
  if (progress.taken === 0) {
    return { headline: `${String(progress.limit)} places open`, detail: 'Be one of the first.' };
  }
  return {
    headline: `${String(progress.taken)}/${String(progress.limit)} joined`,
    detail: progress.left === 1 ? '1 place left' : `${String(progress.left)} places left`,
  };
}

/**
 * How long the founding offer lasts, as the site says it (D-251): "1 year", the way people say it,
 * rather than "12 months". A number of months that is not whole years stays in months.
 */
export function foundingTermWords(months: number): string {
  if (months > 0 && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? '1 year' : `${String(years)} years`;
  }
  return months === 1 ? '1 month' : `${String(months)} months`;
}
