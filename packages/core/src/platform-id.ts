/**
 * The number everybody on the platform has (ADM-02, D-176), written as D and six digits: D000001
 * for the first account, counting up. It is never given to anybody else, so somebody who deletes
 * their account and comes back is a new number. D000000 belongs to nobody.
 */

/** "D000123". Past a million it grows rather than starting again. */
export function platformId(number: number): string {
  return `D${String(Math.trunc(number)).padStart(6, '0')}`;
}

/** The number behind an ID somebody typed, or null when it is not one. */
export function platformNumberOf(value: string): number | null {
  const typed = value.trim();
  if (!/^[Dd]?\d{1,15}$/.test(typed)) return null;
  const number = Number(typed.replace(/^[Dd]/, ''));
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** Whether what somebody typed looks like an ID rather than a name, email or number. */
export function isPlatformId(value: string): boolean {
  return platformNumberOf(value) !== null;
}
