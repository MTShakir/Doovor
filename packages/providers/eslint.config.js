import { providers } from '@repo/config/eslint/providers';

export default [
  ...providers(import.meta.dirname),
  {
    // Commands somebody runs by hand in Node, which print what they did (RUNBOOK 3.7a).
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
];
