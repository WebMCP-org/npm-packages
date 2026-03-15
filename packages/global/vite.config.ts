import type { Options } from 'vite-plus/pack';

import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';

// ESM build for npm package
const esmConfig: Options = {
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: ['@mcp-b/transports', '@mcp-b/webmcp-ts-sdk'],
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
  external: [], // Bundle everything - no externals for standalone script
  noExternal: [/.*/], // Explicitly bundle all dependencies
  tsconfig: './tsconfig.json',
  outDir: 'dist',
  globalName: 'WebMCP',
  outExtensions: () => ({ js: '.js' }),
  onSuccess: async () => {
    console.log('✓ IIFE build complete - auto-initializes on load');
  },
};

export default defineConfig({
  pack: [esmConfig, iifeConfig],
  test: {
    // Use browser mode for real DOM, postMessage, and navigator testing
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    // Test file patterns - exclude esm-resolution tests as they need Node.js
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['dist', 'node_modules', 'src/esm-resolution.test.ts', 'src/conformance/**/*.test.ts'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
