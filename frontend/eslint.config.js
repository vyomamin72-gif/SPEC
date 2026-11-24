import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The physics engine and data layer must stay independent of the UI so
    // they can be tested in plain Node and moved into Web Workers unchanged.
    files: ['src/physics/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react/*', 'zustand', '@/components/**', '@/pages/**', '@/hooks/**', '@/stores/**'],
              message: 'physics/ and data/ must not depend on React or UI code.',
            },
          ],
        },
      ],
    },
  },
)
