/**
 * Claiming for business miles at HMRC's approved rates (MNY-03, D-198).
 *
 * A car is claimed at 45p a mile for the first 10,000 business miles of a tax year and 25p after
 * that. Which band a mile falls in depends on how many came before it in the same year, so a rate
 * cannot be stored against a trip: the claim is worked out over the year as a whole, which is also
 * how a return asks for it.
 *
 * Distances are tenths of a mile, held as whole numbers, for the same reason money is held in
 * pence: a distance that has been through a float is a distance nobody can add up twice and get
 * the same answer.
 */

export interface AmapRates {
  /** Miles at the higher rate, in tenths. */
  firstTenths: number;
  /** Pence a mile up to that, and after it. */
  firstPence: number;
  afterPence: number;
}

/**
 * The rates a tax year uses. 45p and 25p have applied since 2011 to 2012; a year HMRC changes them
 * gets an entry here and nothing else has to move.
 */
const ratesByYear: Record<number, AmapRates> = {};

const standardRates: AmapRates = { firstTenths: 100_000, firstPence: 45, afterPence: 25 };

export function amapRates(taxYearStarts: number): AmapRates {
  return ratesByYear[taxYearStarts] ?? standardRates;
}

/** Ten tenths to the mile, named so the sums below read as what they are. */
export const tenthsPerMile = 10;

/** Miles as somebody writes them down, into the tenths the books hold. Null when it is not a distance. */
export function tenthsFromMiles(miles: string | number): number | null {
  const value = typeof miles === 'number' ? miles : Number(miles.trim());
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return null;
  const tenths = Math.round(value * tenthsPerMile);
  return tenths === 0 ? null : tenths;
}

/** Tenths back into miles for reading: "7.5 miles", "12 miles". */
export function formatMiles(tenths: number): string {
  const miles = tenths / tenthsPerMile;
  const written = Number.isInteger(miles) ? String(miles) : miles.toFixed(1);
  return `${written} ${tenths === tenthsPerMile ? 'mile' : 'miles'}`;
}

/**
 * What a year's business miles come to, in pence, with the bands applied in order. Rounded once at
 * the end: rounding each band separately would drift by a penny against what an accountant writes.
 */
export function mileageClaimPence(totalTenths: number, taxYearStarts: number): number {
  if (!Number.isFinite(totalTenths) || totalTenths <= 0) return 0;
  const rates = amapRates(taxYearStarts);
  const atFirst = Math.min(totalTenths, rates.firstTenths);
  const atAfter = Math.max(0, totalTenths - rates.firstTenths);
  return Math.round((atFirst * rates.firstPence + atAfter * rates.afterPence) / tenthsPerMile);
}

/** The bands a year's miles fall into, for a screen that shows the working. */
export function mileageBands(
  totalTenths: number,
  taxYearStarts: number,
): { tenths: number; pencePerMile: number; totalPence: number }[] {
  const rates = amapRates(taxYearStarts);
  const atFirst = Math.min(Math.max(totalTenths, 0), rates.firstTenths);
  const atAfter = Math.max(0, totalTenths - rates.firstTenths);
  const bands: { tenths: number; pencePerMile: number; totalPence: number }[] = [];
  if (atFirst > 0) {
    bands.push({ tenths: atFirst, pencePerMile: rates.firstPence, totalPence: Math.round((atFirst * rates.firstPence) / tenthsPerMile) });
  }
  if (atAfter > 0) {
    bands.push({ tenths: atAfter, pencePerMile: rates.afterPence, totalPence: Math.round((atAfter * rates.afterPence) / tenthsPerMile) });
  }
  return bands;
}
