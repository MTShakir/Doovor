/**
 * What every response tells the browser it may load, talk to, and be framed by (ARCHITECTURE 6.6,
 * NFR-SEC-03, M6-04, D-138).
 *
 * The third party origins are the ones each provider publishes, not the ones we have watched work.
 * Stripe starts frames on origins of its own choosing, and a payment refused by our own policy is a
 * lost booking that nothing in our logs would explain. The tests next to this file hold each set to
 * what the provider documents, because the local and test environments stand a fake card machine in
 * for the real one, so no end to end run ever asks Stripe for anything.
 *
 * Built here rather than in next.config.ts so it can be read and tested on its own. It takes the
 * environment as an argument for the same reason, and because the config file loads the root
 * .env.local itself, after its imports have run.
 */

export interface HeaderEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_POSTHOG_HOST?: string | undefined;
  NEXT_PUBLIC_SENTRY_DSN?: string | undefined;
  /** A production build forbids eval and asks the browser to upgrade anything left on http. */
  production?: boolean | undefined;
}

export interface ResponseHeader {
  key: string;
  value: string;
}

/** Stripe.js, its Payment Element and the frames it opens (docs.stripe.com/security/guide). */
const stripe = {
  /** Stripe puts its card fields on origins of its own, for speed, and names them with a wildcard. */
  scripts: ['https://js.stripe.com', 'https://*.js.stripe.com'],
  /** hooks.stripe.com is where a card sends the person for 3D Secure, m.stripe.network is fraud checks. */
  frames: ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com', 'https://m.stripe.network'],
  connect: ['https://api.stripe.com'],
  images: ['https://*.stripe.com'],
};

/**
 * Link, Stripe's own saved card wallet. The Payment Element offers it unless it is switched off, and
 * that is the product owner's choice to make, so the policy admits it either way (D-138).
 */
const link = {
  frames: ['https://link.com', 'https://*.link.com'],
  connect: ['https://link.com', 'https://*.link.com'],
  images: ['https://*.link.com'],
};

/**
 * The map library (docs.mapbox.com/mapbox-gl-js/guides/browsers-and-testing). It is bundled with the
 * app rather than fetched, so it needs no script origin, but it builds its tile workers from blobs,
 * and the coverage picture on a public page is drawn by api.mapbox.com (D-132).
 */
const mapbox = {
  connect: ['https://api.mapbox.com', 'https://events.mapbox.com'],
  images: ['https://api.mapbox.com'],
};

/** The origin of a URL from the environment, or nothing when it is not set. */
function originOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy(env: HeaderEnvironment): string {
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  // Live rows and presence arrive over a socket on the same host (D-054).
  const supabaseSocket = supabase.map((origin) => origin.replace(/^http/, 'ws'));
  const posthog = originOf(env.NEXT_PUBLIC_POSTHOG_HOST);
  const sentry = originOf(env.NEXT_PUBLIC_SENTRY_DSN);

  return [
    "default-src 'self'",
    // Inline scripts because Next puts its own into every page, and inline styles because the brand's
    // stylesheet is written from brand.ts into the head. A nonce would mean rendering every page for
    // every request, which is what the public pages must not do (NFR-PERF-04, D-138).
    ['script-src', "'self'", "'unsafe-inline'", ...stripe.scripts, ...posthog, ...(env.production ? [] : ["'unsafe-eval'"])].join(' '),
    "style-src 'self' 'unsafe-inline'",
    ['img-src', "'self'", 'data:', 'blob:', ...supabase, ...mapbox.images, ...stripe.images, ...link.images].join(' '),
    "font-src 'self'",
    ['connect-src', "'self'", ...supabase, ...supabaseSocket, ...mapbox.connect, ...stripe.connect, ...link.connect, ...posthog, ...sentry].join(' '),
    // The map library builds its tile workers itself; ours is served from our own origin.
    "worker-src 'self' blob:",
    ['frame-src', "'self'", ...stripe.frames, ...link.frames].join(' '),
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(env.production ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function securityHeaders(env: HeaderEnvironment): ResponseHeader[] {
  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Stripe's frame asks the browser for Apple Pay and Google Pay, so it may use the Payment Request API.
    { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(self "https://js.stripe.com")' },
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(env) },
  ];
}
