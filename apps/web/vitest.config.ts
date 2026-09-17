import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next compiles JSX itself, so the app's tsconfig leaves it as written; a test has to compile it.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` exists to fail a build that imports a server module from a client one.
      // There is no such boundary in a unit test, and the real one is enforced by the build.
      'server-only': path.resolve(import.meta.dirname, 'src/test/server-only.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
