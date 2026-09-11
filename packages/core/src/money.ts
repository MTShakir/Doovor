/**
 * Money is always integer pence (CLAUDE.md rule 3). These helpers never use floating point
 * arithmetic on amounts: parsing works on the digits of the string, and percentages round
 * half up to a whole penny.
 */

export type Pence = number;

export function isPence(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function assertPence(value: number, label = 'amount'): asserts value is Pence {
  if (!isPence(value)) throw new RangeError(`${label} must be integer pence, got ${String(value)}`);
}

const wholePounds = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats pence as £42 for whole pounds or £42.50 otherwise (PRD 7.6). Integer maths only. */
export function formatPence(pence: number, options: { alwaysShowPence?: boolean } = {}): string {
  assertPence(pence);
  const abs = Math.abs(pence);
  const poundsText = wholePounds.format(Math.trunc(abs / 100));
  const rest = abs % 100;
  const formatted =
    rest === 0 && !options.alwaysShowPence
      ? poundsText
      : `${poundsText}.${String(rest).padStart(2, '0')}`;
  return pence < 0 ? `-${formatted}` : formatted;
}

const POUNDS_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** Parses user input such as "42", "42.5" or "£1,234.56" into pence. Returns null if invalid. */
export function parsePoundsToPence(input: string): Pence | null {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '');
  const match = POUNDS_PATTERN.exec(cleaned);
  if (!match) return null;
  const [, poundsDigits = '0', penceDigits = ''] = match;
  const pence = Number(poundsDigits) * 100 + Number(penceDigits.padEnd(2, '0'));
  return isPence(pence) ? pence : null;
}

/** Percentage of an amount in whole pence, rounding halves up. Used for fees (R-06). */
export function applyPercent(pence: number, percent: number): Pence {
  assertPence(pence);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`percent must be an integer from 0 to 100, got ${String(percent)}`);
  }
  // Integer maths: (pence * percent) is exact; add 50 before dividing to round half up.
  return Math.floor((pence * percent + 50) / 100);
}

export function sumPence(amounts: readonly number[]): Pence {
  return amounts.reduce((total, amount) => {
    assertPence(amount);
    return total + amount;
  }, 0);
}
