import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'artifacts/**', 'reports/**', 'playwright-report/**', 'playwright-published-report/**', 'playwright-leaderboard-report/**', 'test-results/**', 'public/**', 'assets/**', 'drizzle/meta/**', '.claude/**'] },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Pixi internals and existing browser test harnesses use explicit escape hatches.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: { ...hooks.configs.recommended.rules, ...a11y.configs.recommended.rules },
  },
);
