import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    // Use browser mode for real DOM, postMessage, and navigator testing
    browser: {
      enabled: true,
      provider: playwright({
        launch: isCI ? { channel: 'chrome-beta' } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    // Test file patterns - exclude esm-resolution tests as they need Node.js
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['dist', 'node_modules', 'src/esm-resolution.test.ts'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
