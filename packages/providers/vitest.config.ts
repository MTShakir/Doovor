import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // contract.ts holds the assertions every implementation is run against. It is test
      // scaffolding like the files beside it, so measuring coverage of it says nothing about
      // whether the product is tested: an untaken branch there is an assertion, not a gap.
      exclude: ['src/**/*.test.ts', 'src/**/contract.ts', 'src/**/index.ts', 'src/**/types.ts'],
      reporter: ['text-summary', 'html'],
      // CLAUDE.md: 90% line coverage gate for domain logic.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
