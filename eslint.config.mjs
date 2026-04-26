import next from 'eslint-config-next'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

const specStrictFiles = [
  'src/lib/spec-strict-sentinel.ts',
  'src/lib/feature-flags.ts',
  'src/types/product-line.ts',
  'src/components/layout/workspace-switcher.tsx',
  'src/lib/routing-rule-evaluator.ts',
  'src/lib/output-schema-validator.ts',
  'src/lib/task-create.ts',
]

const config = tseslint.config(
  ...next,
  {
    ignores: [
      '.data/**',
      'ops/**',
      'test-results/**',
      'playwright-report/**',
      '.tmp/**',
      '.playwright-mcp/**',
    ],
  },
  {
    files: specStrictFiles,
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/extensions': ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.spec-strict.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
        },
      },
    },
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          'newlines-between': 'never',
        },
      ],
    },
  },
  // The React 19/ESLint ecosystem is still settling. These rules are valuable,
  // but they currently trigger a lot of false positives in this codebase.
  // Keep them off until we do a dedicated refactor pass.
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
)

export default config
