/** How many more lessons "Show more" adds under Today's upcoming lessons (D-167). */
export const upcomingStep = 5;
const most = 50;

/**
 * How many upcoming lessons to show, from the address: five to begin with, in fives, and no more
 * than fifty, since the diary is where somebody reads further ahead than that.
 */
export function upcomingCount(value: string | undefined): number {
  const asked = Number(value);
  if (!Number.isInteger(asked) || asked < upcomingStep || asked % upcomingStep !== 0) return upcomingStep;
  return Math.min(asked, most);
}
