/**
 * Sending a text message (NTF-01, M2-30).
 *
 * Reminders only, and only on a plan that includes them. Everything that texts goes through
 * this interface, so nothing real is sent from a local or test run. Twilio is the
 * implementation today.
 */

export interface SmsMessage {
  /** In E.164, the way every number is stored here: +447700900123. */
  to: string;
  body: string;
}

export type SmsFailure =
  /** The number or the message was refused: sending it again will not help. */
  | 'REJECTED'
  /** The service could not be reached, or answered with something unusable. Try again. */
  | 'UNAVAILABLE'
  /** Nothing is configured to send with. */
  | 'NOT_CONFIGURED';

export type SmsResult = { ok: true; id: string } | { ok: false; reason: SmsFailure; message: string };

export interface SmsProvider {
  send: (message: SmsMessage) => Promise<SmsResult>;
}
