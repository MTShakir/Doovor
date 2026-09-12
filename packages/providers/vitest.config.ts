import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/types.ts'],
      reporter: ['text-summary', 'html'],
      // CLAUDE.md: 90% line coverage gate for domain logic.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
