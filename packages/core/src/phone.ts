/**
 * UK mobile numbers (AUTH-02). Accepts common written forms and returns E.164,
 * for example "07700 900001", "+44 7700 900001" and "0044 7700 900001" all give
 * "+447700900001". Returns null for anything that is not a UK mobile.
 */
export function normaliseUkMobile(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, '');
  let national: string;
  if (compact.startsWith('+44')) national = compact.slice(3);
  else if (compact.startsWith('0044')) national = compact.slice(4);
  else if (compact.startsWith('44') && compact.length === 12) national = compact.slice(2);
  else if (compact.startsWith('0')) national = compact.slice(1);
  else return null;
  // UK mobiles: 7 followed by 9 digits (07xxx xxxxxx nationally).
  return /^7\d{9}$/.test(national) ? `+44${national}` : null;
}

/** "+447700900001" as "07700 900001" for display. */
export function formatUkMobile(e164: string): string {
  const match = /^\+44(7\d{3})(\d{6})$/.exec(e164);
  return match ? `0${match[1] ?? ''} ${match[2] ?? ''}` : e164;
}
