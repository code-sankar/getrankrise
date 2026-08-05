import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Unit tests run under `node --test`, not in the browser: they need node
    // globals, and they stub localStorage on globalThis before importing the
    // slices (authSlice reads it at module scope), which browser-only globals
    // would flag as an assignment to a read-only global.
    files: ['**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, localStorage: 'writable' },
    },
  },
])
