import type { SmsMessage, SmsProvider, SmsResult } from './types.ts';

export interface LogSmsOptions {
  write?: (line: string) => void;
  keep?: SmsMessage[];
}

/** What local and test runs use: it writes a line and sends nothing (ARCHITECTURE 10). */
export function logSmsProvider(options: LogSmsOptions = {}): SmsProvider & { sent: SmsMessage[] } {
  const sent = options.keep ?? [];
  // A warning, not a note: a text that was not really sent is worth noticing.
  const write = options.write ?? ((line: string) => { console.warn(line); });

  return {
    sent,
    send: (message: SmsMessage): Promise<SmsResult> => {
      sent.push(message);
      write(`[sms] to ${message.to}: ${message.body}`);
      return Promise.resolve({ ok: true, id: `log_${String(sent.length)}` });
    },
  };
}
