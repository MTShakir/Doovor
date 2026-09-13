import type { EmailMessage, EmailProvider, EmailResult } from './types.ts';

export interface LogEmailOptions {
  /** Where the line goes. The console by default. */
  write?: (line: string) => void;
  /** Kept in memory so a test can read what would have been sent. */
  keep?: EmailMessage[];
}

/**
 * What local and test runs use (ARCHITECTURE 10). It writes a line about the message and
 * keeps it, and sends nothing anywhere: nothing real leaves a developer's machine.
 */
export function logEmailProvider(options: LogEmailOptions = {}): EmailProvider & { sent: EmailMessage[] } {
  const sent = options.keep ?? [];
  // A warning, not a note: an email that was not really sent is worth noticing.
  const write = options.write ?? ((line: string) => { console.warn(line); });

  return {
    sent,
    send: (message: EmailMessage): Promise<EmailResult> => {
      sent.push(message);
      write(`[email] to ${message.to}: ${message.subject}`);
      return Promise.resolve({ ok: true, id: `log_${String(sent.length)}` });
    },
  };
}
