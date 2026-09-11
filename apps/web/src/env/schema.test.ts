import { describe, expect, it } from 'vitest';
import { clientEnvSchema, describeEnvError, serverEnvSchema } from './schema';

const baseServer = { SUPABASE_SECRET_KEY: 'sb_secret_test' };

describe('serverEnvSchema', () => {
  it('defaults every provider to a local fake', () => {
    const env = serverEnvSchema.parse(baseServer);
    expect(env).toMatchObject({ APP_ENV: 'local', EMAIL_PROVIDER: 'log', SMS_PROVIDER: 'log', PAYMENTS_PROVIDER: 'fake' });
  });

  it('requires the Supabase secret key', () => {
    expect(serverEnvSchema.safeParse({}).success).toBe(false);
  });

  it('requires a real provider’s secrets once it is selected', () => {
    const result = serverEnvSchema.safeParse({ ...baseServer, PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(['STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']);
    }
  });

  it('refuses fakes in production and names each problem', () => {
    const result = serverEnvSchema.safeParse({ ...baseServer, APP_ENV: 'production' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = describeEnvError(result.error);
      expect(message).toContain('EMAIL_PROVIDER: EMAIL_PROVIDER cannot be "log" in production');
      expect(message).toContain('PAYMENTS_PROVIDER: PAYMENTS_PROVIDER cannot be "fake" in production');
      expect(message).toContain('FIELD_ENCRYPTION_KEYS: FIELD_ENCRYPTION_KEYS is required');
      expect(message).toContain('See .env.example.');
    }
  });

  it('accepts a complete production configuration', () => {
    const result = serverEnvSchema.safeParse({
      ...baseServer,
      APP_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_x',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_MESSAGING_SERVICE_SID: 'MG1',
      PAYMENTS_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_live',
      STRIPE_WEBHOOK_SECRET: 'whsec_1',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_2',
      INNGEST_EVENT_KEY: 'e',
      INNGEST_SIGNING_KEY: 's',
      FIELD_ENCRYPTION_KEYS: 'v1:abc',
    });
    expect(result.success).toBe(true);
  });
});

describe('clientEnvSchema', () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };

  it('turns flag strings into booleans and keeps Apple off by default', () => {
    const env = clientEnvSchema.parse({ ...base, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: 'true' });
    expect(env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED).toBe(true);
    expect(env.NEXT_PUBLIC_AUTH_APPLE_ENABLED).toBe(false);
  });

  it('uses the PostHog EU host by default', () => {
    expect(clientEnvSchema.parse(base).NEXT_PUBLIC_POSTHOG_HOST).toBe('https://eu.i.posthog.com');
  });

  it('rejects a malformed Supabase URL', () => {
    expect(clientEnvSchema.safeParse({ ...base, NEXT_PUBLIC_SUPABASE_URL: 'not a url' }).success).toBe(false);
  });
});
