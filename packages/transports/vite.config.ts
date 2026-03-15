import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isBrowserRun = process.env.VITEST_BROWSER === 'true';

const isCI = process.env.CI === 'true';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'esnext',
    platform: 'browser',
    external: [],
    tsconfig: './tsconfig.json',
  },
  test: {
    browser: {
      enabled: isBrowserRun,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    include: isBrowserRun
      ? ['src/**/*.browser.test.ts', 'src/**/*.browser.spec.ts']
      : ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'dist',
      'node_modules',
      ...(isBrowserRun ? [] : ['src/**/*.browser.test.ts', 'src/**/*.browser.spec.ts']),
    ],
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
