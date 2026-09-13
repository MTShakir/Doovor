import 'server-only';
import { logSmsProvider, twilioSmsProvider, type SmsProvider } from '@repo/providers/sms';
import { serverEnv } from '@/env/server';

/**
 * What texts in this environment (NTF-01, ARCHITECTURE 10). Local and test runs write a line
 * to the log and send nothing; anywhere with credentials uses Twilio.
 */
export function smsProvider(): SmsProvider {
  if (serverEnv.SMS_PROVIDER !== 'twilio') return logSmsProvider();

  return twilioSmsProvider({
    accountSid: serverEnv.TWILIO_ACCOUNT_SID,
    authToken: serverEnv.TWILIO_AUTH_TOKEN,
    messagingServiceSid: serverEnv.TWILIO_MESSAGING_SERVICE_SID,
  });
}
