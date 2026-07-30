import type { Options } from 'vite-plus/pack';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';

// ESM build for npm package
const esmConfig: Options = {
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  tsconfig: './tsconfig.json',
  outDir: 'dist',
};

// IIFE build for script tag usage - bundles everything for standalone use
// Uses index.ts which auto-initializes on load
const iifeConfig: Options = {
  entry: {
    index: 'src/index.ts',
  },
  format: ['iife'],
  dts: false,
  sourcemap: false,
  clean: false, // Don't clean since ESM build runs first
  treeshake: true,
  minify: true,
  target: 'esnext',
  platform: 'browser',
  deps: {
    alwaysBundle: [/.*/],
  },
  tsconfig: './tsconfig.json',
  outDir: 'dist',
  globalName: 'WebMCPPolyfill',
  outExtensions: () => ({ js: '.js' }),
  onSuccess: async () => {
    console.log('✓ IIFE build complete - auto-initializes on load');
  },
};

export default defineConfig({
  pack: [esmConfig, iifeConfig],
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/**/*.test.ts'],
    exclude: ['conformance/**/*', 'dist', 'node_modules'],
    globals: true,
    maxConcurrency: isCI ? 1 : 2,
    fileParallelism: false,
  },
});
