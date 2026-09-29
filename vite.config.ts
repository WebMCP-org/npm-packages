import { defineConfig } from 'vite-plus';

const agentToolingIgnorePatterns = [
  '.agent/**',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.continue/**',
  '.cursor/**',
  '.gemini/**',
  '.opencode/**',
  '.pi/**',
  '.roo/**',
  '.windsurf/**',
];

const upstreamVendorIgnorePatterns = ['packages/webmcp-polyfill/src/upstream/**'];

export default defineConfig({
  lint: {
    ignorePatterns: [
      'node_modules/',
      'dist/',
      'dist-bundle/',
      'build/',
      '.next/',
      '.turbo/',
      '.cache/',
      'coverage/',
      'chromium/',
      'packages/smart-dom-reader/**/lib/**',
      ...agentToolingIgnorePatterns,
      ...upstreamVendorIgnorePatterns,
    ],
    jsPlugins: [{ name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' }],
    rules: {
      'anti-slop/no-chained-type-assertions': 'error',
      'anti-slop/no-known-value-widening': 'error',
      'anti-slop/no-module-mocking': 'error',
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-runtime-typeof': 'error',
      'anti-slop/no-unknown-parameters': 'error',
      'anti-slop/no-unknown-returns': 'error',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-unsafe-dictionary-type': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'error',
    },
  },
  fmt: {
    ignorePatterns: [
      '**/dist/**',
      'tools/oxlint/anti-slop/**',
      ...agentToolingIgnorePatterns,
      ...upstreamVendorIgnorePatterns,
    ],
    singleQuote: true,
    semi: true, // semicolons: "always"
    trailingComma: 'es5',
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    bracketSpacing: true,
    arrowParens: 'always',
  },
  staged: {
    '*.{js,jsx,ts,tsx,mjs,cjs,json,md,yml,yaml}': 'vp check --fix',
  },
});
