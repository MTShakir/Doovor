import { defineConfig } from 'eslint/config';
import { base } from './base.js';

const nodeBuiltins = [
  'assert', 'buffer', 'child_process', 'crypto', 'dns', 'events', 'fs', 'fs/promises', 'http',
  'https', 'net', 'os', 'path', 'process', 'stream', 'tls', 'url', 'util', 'worker_threads', 'zlib',
];

/**
 * packages/core must run in the browser, the service worker, Node and a future Expo app,
 * so it may not import frameworks, vendor SDKs, Node built-ins or app-side packages.
 * @param {string} tsconfigRootDir
 */
export function core(tsconfigRootDir) {
  const message = 'packages/core must stay framework-free (CLAUDE.md, ARCHITECTURE.md section 3).';
  return defineConfig([
    ...base(tsconfigRootDir),
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: nodeBuiltins.map((name) => ({ name, message })),
            patterns: [
              {
                group: [
                  'node:*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*',
                  '@supabase/*', 'stripe', 'server-only', '@repo/db', '@repo/db/*', '@repo/ui',
                  '@repo/ui/*', '@repo/providers', '@repo/providers/*', '@repo/emails', '@repo/emails/*',
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
