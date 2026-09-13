import { createSerwistRoute } from '@serwist/turbopack';

/**
 * Serwist compiles the service worker through this route rather than a bundler plugin,
 * because Next builds with Turbopack and Turbopack has no plugins yet (D-013, M2-29).
 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  // Nothing is precached yet. The worker exists for push in this milestone, and four
  // megabytes of static files pushed at somebody the moment they turn notifications on is
  // not a trade anybody asked for. What to keep offline is decided in M4 (PRG-09).
  globPatterns: [],
  // Windows defaults to the WebAssembly build of esbuild, which is slower for no reason here.
  useNativeEsbuild: true,
});
