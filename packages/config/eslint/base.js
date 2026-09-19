import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Shared type-aware ESLint config for every workspace package.
 * @param {string} tsconfigRootDir Directory of the package's tsconfig.json (pass import.meta.dirname).
 */
export function base(tsconfigRootDir) {
  return defineConfig([
    globalIgnores([
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.gen.ts',
      '**/next-env.d.ts',
    ]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        // Non-null assertions need an eslint-disable comment explaining why (CLAUDE.md).
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // `||` on strings is intentional: an empty string should fall back too.
        '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
        eqeqeq: ['error', 'always'],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        // Zod is handed out by one module, which first tells it what it may do in a browser
        // (D-140). A schema built from any other copy would ask to compile itself, and our
        // content security policy would refuse, on every page that has a schema.
        'no-restricted-imports': [
          'error',
          { paths: [{ name: 'zod', message: "Import { z } from '@repo/core/zod' instead (D-140)." }] },
        ],
      },
    },
    {
      // The one module that may: it is the one doing the telling.
      files: ['**/src/zod.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
    },
  ]);
}
