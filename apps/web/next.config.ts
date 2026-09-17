import { withSerwist } from '@serwist/turbopack';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers.ts';

// One .env.local at the repository root serves the app, scripts and the Supabase CLI.
// Next has already loaded env files from apps/web by the time this runs, so load the root
// file directly. Existing variables (for example from Vercel) are never overwritten.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env.local');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// The policy and the headers are built in their own module, tested there, and take the environment
// as an argument because the root .env.local above is loaded after this file's imports have run
// (M6-04, D-138).
const headers = securityHeaders({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  production: process.env.NODE_ENV === 'production',
});

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
  // Share images read the typeface from disk as they are drawn (M5-08), which a trace may not see.
  outputFileTracingIncludes: {
    '/**/share.png': ['src/assets/fonts/*.woff'],
    '/dev/share-images/*': ['src/assets/fonts/*.woff'],
  },
  /** The worker is compiled at /serwist/sw.js and served from the root, so its scope is the app. */
  rewrites() {
    return Promise.resolve([{ source: '/sw.js', destination: '/serwist/sw.js' }]);
  },
  headers() {
    return Promise.resolve(
      indexable
        ? [{ source: '/(.*)', headers }, ...privateAreas.map((source) => ({ source, headers: noindex }))]
        : [{ source: '/(.*)', headers: [...headers, ...noindex] }],
    );
  },
};

export default withSerwist(nextConfig);
