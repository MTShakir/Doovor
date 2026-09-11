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
  "script-src 'self' 'unsafe-inline'" + (isProduction ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https: wss: http://127.0.0.1:54321 ws://127.0.0.1:54321",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(self)' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev badge sits over the mobile tab bar. Build errors still show in the overlay.
  devIndicators: false,
  cacheComponents: true,
  typedRoutes: true,
  transpilePackages: ['@repo/config', '@repo/core', '@repo/ui'],
  headers() {
    return Promise.resolve([{ source: '/(.*)', headers: securityHeaders }]);
  },
};

export default nextConfig;
