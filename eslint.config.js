import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // The `any` casts that remain are at DOM/File-System-Access API
      // boundaries where the lib types are incomplete; warn rather than error.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow intentionally-unused names prefixed with `_` (e.g. a destructured
      // prop kept for its render-triggering side effect).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // eslint-plugin-react-hooks v7 ships the React-Compiler rule set in
      // `recommended`. Those rules (refs/immutability/purity/set-state-in-effect)
      // flag idiomatic react-three-fiber imperative code and benign async
      // setState-in-effect patterns. We keep the CLASSIC correctness rules
      // (rules-of-hooks, exhaustive-deps) as errors, but treat the new
      // compiler-era rules as advisory warnings rather than blocking errors.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
);
