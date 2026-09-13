/**
 * Sharing an invitation (AUTH-07, M2-03).
 *
 * An instructor sends the link however they already talk to that learner: a WhatsApp message,
 * a text, or an email. These build the addresses that hand the message to those apps with the
 * words already written.
 */

export interface InvitationMessage {
  /** The full link, including the token. */
  link: string;
  /** Who is inviting them, for the message itself. */
  instructorName: string;
  /** The learner's name, when the instructor gave one. */
  learnerName?: string | null;
  /** Where to send it, for the channels that need an address. */
  email?: string | null;
  phone?: string | null;
}

/** What the message says. Plain, short, and the same wherever it is sent. */
export function invitationText(message: InvitationMessage): string {
  const greeting = message.learnerName ? `Hi ${message.learnerName}, ` : 'Hi, ';
  return `${greeting}it is ${message.instructorName}. Book your driving lessons with me here: ${message.link}`;
}

export function invitationSubject(message: InvitationMessage): string {
  return `Your driving lessons with ${message.instructorName}`;
}

/** wa.me takes the text as a query; the person picks the contact in WhatsApp. */
export function whatsappShareUrl(message: InvitationMessage): string {
  const number = (message.phone ?? '').replace(/[^0-9]/g, '');
  const text = encodeURIComponent(invitationText(message));
  return number === '' ? `https://wa.me/?text=${text}` : `https://wa.me/${number}?text=${text}`;
}

/** The `sms:` scheme opens the messages app. `?&body=` is the spelling both phones accept. */
export function smsShareUrl(message: InvitationMessage): string {
  return `sms:${message.phone ?? ''}?&body=${encodeURIComponent(invitationText(message))}`;
}

export function emailShareUrl(message: InvitationMessage): string {
  // Percent-encoded by hand: a mail client reads a plus sign in a mailto as a plus sign, not
  // as the space that URLSearchParams would have meant by it.
  const subject = encodeURIComponent(invitationSubject(message));
  const body = encodeURIComponent(invitationText(message));
  return `mailto:${message.email ?? ''}?subject=${subject}&body=${body}`;
}

/** Where an invitation link points. One place, so the page and the message cannot disagree. */
export function invitationLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/invite/${encodeURIComponent(token)}`;
}
