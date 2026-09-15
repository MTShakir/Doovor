import { defineConfig } from 'eslint/config';
import { base } from './base.js';

/**
 * packages/providers is where vendor SDKs are allowed to live: that is the point of it. What
 * it may not do is reach into the app, because a provider that knows about a React component
 * or a database table is no longer something that can be swapped out
 * (CLAUDE.md, ARCHITECTURE.md section 3).
 * @param {string} tsconfigRootDir
 */
export function providers(tsconfigRootDir) {
  const message = 'A provider must not depend on the app: keep it to the interface and the vendor.';
  return defineConfig([
    ...base(tsconfigRootDir),
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  'react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*',
                  'server-only', '@repo/db', '@repo/db/*', '@repo/ui', '@repo/ui/*',
                  '@repo/emails', '@repo/emails/*',
                ],
                message,
              },
            ],
          },
        ],
      },
    },
  ]);
}
