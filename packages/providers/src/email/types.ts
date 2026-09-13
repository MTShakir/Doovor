/**
 * Sending email (NTF-01, NTF-03, M2-28).
 *
 * Everything that sends goes through this interface, so the service behind it can change
 * without touching a feature, and so local and test runs send nothing at all. Resend is the
 * implementation today.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** The same message in words, for clients that will not show HTML. */
  text: string;
  /**
   * The same key for the same message, so a job that runs twice does not send twice. The
   * notification's dedupe key is what goes in here (ARCHITECTURE 10).
   */
  idempotencyKey?: string;
  replyTo?: string;
  /** Who it comes from, as "Name <address>". The provider fills this in from brand.ts. */
  from?: string;
}

export type EmailFailure =
  /** The address or the message was refused: sending it again will not help. */
  | 'REJECTED'
  /** The service could not be reached, or answered with something unusable. Try again. */
  | 'UNAVAILABLE'
  /** Nothing is configured to send with. */
  | 'NOT_CONFIGURED';

export type EmailResult = { ok: true; id: string } | { ok: false; reason: EmailFailure; message: string };

export interface EmailProvider {
  send: (message: EmailMessage) => Promise<EmailResult>;
}
