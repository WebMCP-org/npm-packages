import { defineConfig } from 'vite-plus';

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
      'packages/chrome-devtools-mcp/**',
      'packages/smart-dom-reader/**/lib/**',
    ],
  },
  fmt: {
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
    'package.json': 'pnpm dlx sort-package-json',
  },
});
