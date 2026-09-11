import { defineConfig } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './base.js';

/**
 * React packages: hooks rules and static accessibility checks on top of the base config.
 * @param {string} tsconfigRootDir
 */
export function react(tsconfigRootDir) {
  return defineConfig([
    ...base(tsconfigRootDir),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { globals: { ...globals.browser } },
      plugins: { 'react-hooks': reactHooks },
      rules: {
        ...reactHooks.configs.recommended.rules,
        // React event props accept async handlers (for example react-hook-form's handleSubmit).
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      },
    },
    {
      files: ['**/*.tsx'],
      ...jsxA11y.flatConfigs.recommended,
    },
  ]);
}
