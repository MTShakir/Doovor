import { withSerwist } from '@serwist/turbopack';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// One .env.local at the repository root serves the app, scripts and the Supabase CLI.
// Next has already loaded env files from apps/web by the time this runs, so load the root
// file directly. Existing variables (for example from Vercel) are never overwritten.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env.local');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Report-only CSP until M6 verifies every third-party origin (ARCHITECTURE.md 6.6).
 * Inline styles are allowed because the brand stylesheet is injected from brand.ts.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Stripe.js draws the card fields in frames of its own (D-099).
  "script-src 'self' 'unsafe-inline' https://js.stripe.com" + (isProduction ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss: http://127.0.0.1:54321 ws://127.0.0.1:54321",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Stripe's frame asks the browser for Apple Pay and Google Pay, so it may use the Payment Request API.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(self "https://js.stripe.com")' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
];

/** Outside production nothing is indexed; in production, private areas never are (D-047). */
const indexable = process.env.APP_ENV === 'production';
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
const privateAreas = ['/app/:path*', '/admin/:path*', '/account/:path*', '/auth/:path*', '/api/:path*', '/mfa', '/verify-phone'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev badge sits over the mobile tab bar. Build errors still show in the overlay.
  devIndicators: false,
  // Dev logging prints Server Action arguments, which include passwords and codes (D-036).
  logging: { serverFunctions: false },
  cacheComponents: true,
  typedRoutes: true,
  experimental: {
    // In development React's debug information travels over the dev server's WebSocket, and a page
    // waits for it before it comes alive, so a screen kept for no signal never would. Sent inside the
    // page instead, the app in development works offline as the built one does (M4-10, D-106).
    reactDebugChannel: false,
  },
  transpilePackages: ['@repo/config', '@repo/core', '@repo/ui'],
  /** The worker is compiled at /serwist/sw.js and served from the root, so its scope is the app. */
  rewrites() {
    return Promise.resolve([{ source: '/sw.js', destination: '/serwist/sw.js' }]);
  },
  headers() {
    return Promise.resolve(
      indexable
        ? [{ source: '/(.*)', headers: securityHeaders }, ...privateAreas.map((source) => ({ source, headers: noindex }))]
        : [{ source: '/(.*)', headers: [...securityHeaders, ...noindex] }],
    );
  },
};

export default withSerwist(nextConfig);
