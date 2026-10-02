import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'design/**',
      'data/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off', // TypeScript already checks this, and knows the DOM types.
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  /**
   * CLAUDE.md: only the auth module and the jobs runner may use asApp(), which skips the
   * per-request row-level security context. Everything else goes through withUser().
   */
  {
    files: ['apps/server/src/**/*.ts'],
    ignores: [
      'apps/server/src/auth/**',
      'apps/server/src/jobs/**',
      'apps/server/src/db.ts',
      'apps/server/src/**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db.js', '**/db'],
              importNames: ['asApp'],
              message:
                'asApp() skips row-level security. Use withUser(); only auth/** and jobs/** may call asApp().',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/web/src/**/*.tsx', 'apps/web/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
