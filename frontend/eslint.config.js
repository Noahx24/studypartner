import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Correctness-focused lint: the JSX views aren't type-checked by tsc
// (allowJs is off), so no-undef here is the only automated guard
// against referencing variables that don't exist.
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      ...js.configs.recommended.rules,
      // The classic hook rules. The newer compiler-derived rules
      // (purity, set-state-in-effect) flag accepted shadcn/idiomatic
      // patterns used throughout this codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React components are referenced via JSX, which plain no-unused-vars
      // can't see without the React plugin; keep the signal high instead.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
];
