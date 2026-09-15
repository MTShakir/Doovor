import { createSerwistRoute } from '@serwist/turbopack';

/**
 * Serwist compiles the service worker through this route rather than a bundler plugin,
 * because Next builds with Turbopack and Turbopack has no plugins yet (D-013, M2-29).
 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'src/app/sw.ts',
  // Nothing from the build is precached. Five megabytes of every portal's files, sent to
  // somebody the moment they sign in, is not a trade anybody asked for. The screens kept for no
  // signal, and the files they are drawn with, are kept as they open instead (M4-08, D-104).
  globPatterns: [],
  // Windows defaults to the WebAssembly build of esbuild, which is slower for no reason here.
  useNativeEsbuild: true,
});
