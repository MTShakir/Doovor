import type { ClientEnv } from './schema';

/**
 * The public configuration a browser may see (NFR-SEC-02, D-197).
 *
 * Each value is named in full so Next.js inlines it into the client bundle, which means what
 * arrives in a browser is already a constant. Checking those constants against a schema there
 * bought nothing and cost every visitor Zod's runtime: on a city page it was the largest script
 * of the lot, 82 KB of which 69 KB was never used, and about a third of a second of the main
 * thread. The schema still runs, on the server, where a bad value can still stop a build.
 *
 * `satisfies ClientEnv` keeps this in step with the schema: a variable added there and not here
 * fails the typecheck.
 */

function flag(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * A blank value means "not set": .env.example ships every key blank (KEY=), and hosting
 * dashboards accept empty values.
 */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function required(name: string, value: string | undefined): string {
  const set = text(value);
  if (set === undefined) throw new Error(`${name} is not set. See .env.example.`);
  return set;
}

export const clientEnv = {
  NEXT_PUBLIC_APP_URL: text(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: flag(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED),
  NEXT_PUBLIC_AUTH_APPLE_ENABLED: flag(process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: text(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  NEXT_PUBLIC_MAPBOX_TOKEN: text(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: text(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  NEXT_PUBLIC_SENTRY_DSN: text(process.env.NEXT_PUBLIC_SENTRY_DSN),
  NEXT_PUBLIC_POSTHOG_KEY: text(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  NEXT_PUBLIC_POSTHOG_HOST: text(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? 'https://eu.i.posthog.com',
} satisfies ClientEnv;
