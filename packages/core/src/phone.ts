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

/**
 * "+447700900001" as "07700 900001" for display. Auth keeps numbers without the plus sign
 * ("447700900001"), so that form is read the same way.
 */
export function formatUkMobile(e164: string): string {
  const match = /^\+?44(7\d{3})(\d{6})$/.exec(e164);
  return match ? `0${match[1] ?? ''} ${match[2] ?? ''}` : e164;
}

/**
 * A link that opens WhatsApp on a chat with this number (D-194). WhatsApp wants digits only, with
 * the country code and no plus sign, so "+44 7700 900001" becomes ".../447700900001".
 *
 * Lives here rather than beside a button because a server-rendered page builds the link too, and a
 * function exported from a client component is only a reference on the server, not something to call.
 */
export function whatsAppTo(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
