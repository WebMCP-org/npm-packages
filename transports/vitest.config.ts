import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const isBrowserRun = process.env.VITEST_BROWSER === 'true';

const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    browser: {
      enabled: isBrowserRun,
      provider: playwright(),
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
