import { mostFor } from '@repo/core/catalogue';
import { formatPence } from '@repo/core/money';

/**
 * What a refusal for being above the most a linked instructor's school allows says (D-286), or null
 * for any other refusal. For a package, it says the most that package may cost. Shared by every
 * screen that saves prices, so the first price and the full table say the same thing.
 */
export function aboveSchoolCap(context: Record<string, unknown>, packageMinutes?: number): string | null {
  if (context.reason !== 'above_school_cap' || typeof context.maxHourlyPence !== 'number') return null;
  const school = typeof context.school === 'string' ? context.school : 'Your school';
  const most = `${school} lets you charge at most ${formatPence(context.maxHourlyPence)} an hour`;
  return packageMinutes === undefined
    ? `${most}. Lower the prices above it.`
    : `${most}, so this package can cost at most ${formatPence(mostFor(packageMinutes, context.maxHourlyPence))}.`;
}
