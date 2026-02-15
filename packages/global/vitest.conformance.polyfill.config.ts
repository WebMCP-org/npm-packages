import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/conformance/polyfill-runtime.e2e.test.ts'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    maxConcurrency: isCI ? 1 : 2,
    fileParallelism: false,
  },
});
