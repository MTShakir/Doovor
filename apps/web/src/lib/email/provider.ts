import 'server-only';
import { brand } from '@repo/config/brand';
import { logEmailProvider, resendEmailProvider, type EmailProvider } from '@repo/providers/email';
import { serverEnv } from '@/env/server';

/**
 * What sends email in this environment (NTF-03, ARCHITECTURE 10). Local and test runs write
 * a line to the console and send nothing; anywhere with a key uses Resend.
 */
export function emailProvider(): EmailProvider {
  if (serverEnv.EMAIL_PROVIDER !== 'resend') return logEmailProvider();

  return resendEmailProvider({
    apiKey: serverEnv.RESEND_API_KEY,
    from: `${brand.email.fromName} <${brand.email.fromAddress}>`,
    replyTo: brand.email.replyTo,
  });
}
