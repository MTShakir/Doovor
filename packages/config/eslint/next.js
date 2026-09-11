import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import { react } from './react.js';

/**
 * Next.js app config. Uses @next/eslint-plugin-next directly rather than eslint-config-next
 * to avoid a dependency that fails the supply-chain trust policy (D-028).
 * @param {string} tsconfigRootDir
 */
export function next(tsconfigRootDir) {
  return defineConfig([
    ...react(tsconfigRootDir),
    {
      plugins: { '@next/next': nextPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
  ]);
}
