import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders, type HeaderEnvironment } from './security-headers';

const hosted: HeaderEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  NEXT_PUBLIC_SENTRY_DSN: 'https://key@o123.ingest.de.sentry.io/456',
  production: true,
  hosted: true,
};

/** The policy as the browser reads it: a directive, and the sources it allows. */
function directives(env: HeaderEnvironment): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};
  for (const part of contentSecurityPolicy(env).split('; ')) {
    const [name, ...sources] = part.split(' ');
    expect(parsed, `${name ?? ''} is written twice, and the browser would keep only the first`).not.toHaveProperty(name ?? '');
    parsed[name ?? ''] = sources;
  }
  return parsed;
}

describe('the content security policy (NFR-SEC-03, M6-04)', () => {
  it('falls back on itself, and forbids the things an injected page needs', () => {
    const policy = directives(hosted);
    expect(policy['default-src']).toEqual(["'self'"]);
    // Nothing may plug in a plugin, frame us, rewrite where our own links point, or post our forms away.
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
  });

  it('lets a script run from a string only while a person is developing', () => {
    expect(directives({ ...hosted, production: false })['script-src']).toContain("'unsafe-eval'");
    expect(directives(hosted)['script-src']).not.toContain("'unsafe-eval'");
  });

  it('asks the browser to upgrade http only where there is a certificate', () => {
    expect(directives(hosted)).toHaveProperty('upgrade-insecure-requests');
    // A build on a laptop is served over http, and upgrading its own requests would leave them
    // refused by this very policy (D-146).
    expect(directives({ ...hosted, hosted: false })).not.toHaveProperty('upgrade-insecure-requests');
  });

  /**
   * No end to end run asks Stripe for anything, because the test environment stands a fake card
   * machine in for the real one. These are the origins Stripe publishes, and the only thing
   * standing between a tightened policy and a checkout that fails only in production.
   */
  it('admits every origin Stripe asks for', () => {
    const policy = directives(hosted);
    expect(policy['script-src']).toEqual(expect.arrayContaining(['https://js.stripe.com', 'https://*.js.stripe.com']));
    expect(policy['frame-src']).toEqual(expect.arrayContaining(['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com']));
    expect(policy['connect-src']).toContain('https://api.stripe.com');
    expect(policy['img-src']).toContain('https://*.stripe.com');
    // A card that wants 3D Secure sends the person to hooks.stripe.com, and fraud checks run in a frame.
    expect(policy['frame-src']).toContain('https://m.stripe.network');
    // Link, offered by the Payment Element unless it is switched off.
    expect(policy['frame-src']).toEqual(expect.arrayContaining(['https://link.com', 'https://*.link.com']));
    expect(policy['connect-src']).toEqual(expect.arrayContaining(['https://link.com', 'https://*.link.com']));
    expect(policy['img-src']).toContain('https://*.link.com');
  });

  it('admits every origin the map asks for', () => {
    const policy = directives(hosted);
    expect(policy['connect-src']).toEqual(expect.arrayContaining(['https://api.mapbox.com', 'https://events.mapbox.com']));
    // The library builds its tile workers from a blob, and the coverage picture is drawn by Mapbox.
    expect(policy['worker-src']).toEqual(["'self'", 'blob:']);
    expect(policy['img-src']).toContain('https://api.mapbox.com');
    // The library is bundled with the app, so no script comes from Mapbox.
    expect((policy['script-src'] ?? []).filter((source) => source.includes('mapbox'))).toEqual([]);
  });

  it('admits the database, its socket, and the hosts that count and catch things', () => {
    const policy = directives(hosted);
    expect(policy['connect-src']).toEqual(expect.arrayContaining(['https://abcdefgh.supabase.co', 'wss://abcdefgh.supabase.co']));
    expect(policy['img-src']).toContain('https://abcdefgh.supabase.co');
    expect(policy['connect-src']).toEqual(expect.arrayContaining(['https://eu.i.posthog.com', 'https://o123.ingest.de.sentry.io']));
    expect(policy['script-src']).toContain('https://eu.i.posthog.com');
  });

  it('leaves out what is not set, rather than naming a broken origin', () => {
    const policy = directives({ production: true });
    for (const sources of Object.values(policy)) {
      expect(sources).not.toContain('undefined');
      expect(sources).not.toContain('null');
    }
    expect(policy['connect-src']).toEqual(["'self'", ...['https://api.mapbox.com', 'https://events.mapbox.com'], 'https://api.stripe.com', 'https://link.com', 'https://*.link.com']);
    // A URL that is not one is dropped the same way.
    expect(directives({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' })['connect-src']).not.toContain('not a url');
  });
});

describe('the other security headers (NFR-SEC-03)', () => {
  it('says what it should on every response', () => {
    const headers = new Map(securityHeaders(hosted).map((header) => [header.key, header.value]));
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // A page may see where the car is and take a photograph of a licence; nothing may listen.
    expect(headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(headers.get('Permissions-Policy')).toContain('geolocation=(self)');
    expect(headers.get('Permissions-Policy')).toContain('payment=(self "https://js.stripe.com")');
    // Enforced, so the header is the policy itself and not a report of what would have happened.
    expect(headers.get('Content-Security-Policy')).toBe(contentSecurityPolicy(hosted));
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false);
  });
});
