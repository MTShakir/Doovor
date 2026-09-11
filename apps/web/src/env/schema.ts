/**
 * Environment schemas (NFR-SEC-02). Pure so they can be unit tested. Providers can run as
 * local fakes, so a missing vendor key never blocks work that does not need it yet, but
 * production refuses fakes and fails at boot if a real provider's secret is missing.
 */
import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalString = z.string().trim().min(1).optional();

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: flag,
  NEXT_PUBLIC_AUTH_APPLE_ENABLED: flag,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_MAPBOX_TOKEN: optionalString,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export const serverEnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'preview', 'production']).default('local'),
    SUPABASE_SECRET_KEY: z.string().min(1),

    EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
    RESEND_API_KEY: optionalString,

    SMS_PROVIDER: z.enum(['log', 'twilio']).default('log'),
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_MESSAGING_SERVICE_SID: optionalString,

    PAYMENTS_PROVIDER: z.enum(['fake', 'stripe']).default('fake'),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_CONNECT_WEBHOOK_SECRET: optionalString,

    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,

    FIELD_ENCRYPTION_KEYS: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString,
  })
  .superRefine((env, ctx) => {
    const require = (condition: boolean, keys: (keyof typeof env)[], reason: string) => {
      if (!condition) return;
      for (const key of keys) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when ${reason}` });
      }
    };
    require(env.EMAIL_PROVIDER === 'resend', ['RESEND_API_KEY'], 'EMAIL_PROVIDER is resend');
    require(
      env.SMS_PROVIDER === 'twilio',
      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'],
      'SMS_PROVIDER is twilio',
    );
    require(
      env.PAYMENTS_PROVIDER === 'stripe',
      ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET'],
      'PAYMENTS_PROVIDER is stripe',
    );
    if (env.APP_ENV === 'production') {
      for (const [key, fake] of [
        ['EMAIL_PROVIDER', 'log'],
        ['SMS_PROVIDER', 'log'],
        ['PAYMENTS_PROVIDER', 'fake'],
      ] as const) {
        if (env[key] === fake) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} cannot be "${fake}" in production` });
        }
      }
      require(true, ['INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY', 'FIELD_ENCRYPTION_KEYS'], 'APP_ENV is production');
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Readable one-line-per-problem message for boot failures. */
export function describeEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return `Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example.`;
}
